import { Injectable, Logger } from '@nestjs/common';
import { ChannelCredentialsService } from './channel-credentials.service';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

/** Meta keeps uploaded media for 30 days; ids are reused well inside that window. */
const MEDIA_ID_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MEDIA_ID_CACHE_MAX = 500;

function isPlaceholderToken(token: string): boolean {
  return !token.startsWith('enc:') && (token.length < 20 || /placeholder|replace|demo|test/i.test(token));
}

@Injectable()
export class MetaWhatsAppClient {
  constructor(private readonly credentials?: ChannelCredentialsService, private readonly config?: ConfigService) {}

  private get graphBase(): string { return `https://graph.facebook.com/${this.config?.get<string>('META_GRAPH_VERSION') || 'v26.0'}`; }

  private token(value: string): string {
    if (value.startsWith('enc:') && !this.credentials) throw new Error('Channel credentials unavailable');
    return this.credentials?.open(value) ?? value;
  }
  private authenticatedUrl(path: string, params: { accessToken: string; appSecretEnc?: string }): string {
    const url = new URL(`${this.graphBase}/${path}`);
    const secret = params.appSecretEnc ? this.token(params.appSecretEnc) : this.config?.get<string>('META_APP_SECRET');
    if (secret) url.searchParams.set('appsecret_proof', createHmac('sha256', secret).update(this.token(params.accessToken)).digest('hex'));
    return url.toString();
  }
  private readonly logger = new Logger(MetaWhatsAppClient.name);
  private readonly mediaIds = new Map<string, { id: string; expiresAt: number }>();

  async verifyCredentials(params: {
    phoneNumberId: string;
    accessToken: string;
    appSecretEnc?: string;
  }): Promise<{ ok: boolean; displayName?: string; error?: string }> {
    if (
      isPlaceholderToken(params.accessToken)
    ) {
      return { ok: true, displayName: 'Token local (modo demo)' };
    }

    const url = new URL(this.authenticatedUrl(params.phoneNumberId, params));
    url.searchParams.set('fields', 'display_phone_number,verified_name');
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.token(params.accessToken)}` },
      });
      const payload = (await response.json()) as {
        verified_name?: string;
        display_phone_number?: string;
        error?: { message?: string };
      };
      if (!response.ok) {
        return {
          ok: false,
          error: payload.error?.message ?? `HTTP ${response.status}`,
        };
      }
      return {
        ok: true,
        displayName:
          payload.verified_name ?? payload.display_phone_number ?? undefined,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async sendTextMessage(params: {
    phoneNumberId: string;
    accessToken: string;
    appSecretEnc?: string;
    toPhone: string;
    text: string;
  }): Promise<{ messageId?: string; ok: boolean; error?: string }> {
    return this.sendPayload({
      phoneNumberId: params.phoneNumberId,
      accessToken: params.accessToken, appSecretEnc: params.appSecretEnc,
      body: {
        messaging_product: 'whatsapp',
        to: params.toPhone.replace(/\D/g, ''),
        type: 'text',
        text: { body: params.text },
      },
    });
  }

  /**
   * Interactive message whose link opens from a button instead of a raw URL. Free-form, so
   * only inside the 24-hour customer service window. Meta limits: body 1024 characters,
   * button 20, footer 60; the caller must keep `body` and `buttonText` within them.
   */
  async sendCtaUrlMessage(params: {
    phoneNumberId: string;
    accessToken: string;
    appSecretEnc?: string;
    toPhone: string;
    body: string;
    buttonText: string;
    url: string;
    footer?: string;
  }): Promise<{ messageId?: string; ok: boolean; error?: string; dryRun?: boolean }> {
    if (isPlaceholderToken(params.accessToken)) {
      return { ok: true, dryRun: true, messageId: `cta_local_${Date.now()}` };
    }
    return this.sendPayload({
      phoneNumberId: params.phoneNumberId,
      accessToken: params.accessToken, appSecretEnc: params.appSecretEnc,
      body: {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: params.toPhone.replace(/\D/g, ''),
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          body: { text: params.body },
          ...(params.footer ? { footer: { text: params.footer.slice(0, 60) } } : {}),
          action: {
            name: 'cta_url',
            parameters: { display_text: params.buttonText, url: params.url },
          },
        },
      },
    });
  }

  /**
   * Sends a photo with caption. The JPEG is uploaded once per phone number and source
   * (`cacheKey`) and its media id reused; `loadJpeg` only runs on a cache miss.
   */
  async sendImageMessage(params: {
    phoneNumberId: string;
    accessToken: string;
    appSecretEnc?: string;
    toPhone: string;
    caption: string;
    cacheKey: string;
    loadJpeg: () => Promise<Buffer | null>;
  }): Promise<{ messageId?: string; ok: boolean; error?: string; dryRun?: boolean }> {
    if (isPlaceholderToken(params.accessToken)) {
      return { ok: true, dryRun: true, messageId: `img_local_${Date.now()}` };
    }
    const mediaId = await this.uploadedMediaId(params);
    if (!mediaId) return { ok: false, error: 'image unavailable' };
    return this.sendPayload({
      phoneNumberId: params.phoneNumberId,
      accessToken: params.accessToken, appSecretEnc: params.appSecretEnc,
      body: {
        messaging_product: 'whatsapp',
        to: params.toPhone.replace(/\D/g, ''),
        type: 'image',
        image: { id: mediaId, caption: params.caption.slice(0, 1024) },
      },
    });
  }

  private async uploadedMediaId(params: {
    phoneNumberId: string;
    accessToken: string;
    appSecretEnc?: string;
    cacheKey: string;
    loadJpeg: () => Promise<Buffer | null>;
  }): Promise<string | null> {
    const key = `${params.phoneNumberId}:${params.cacheKey}`;
    const cached = this.mediaIds.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.id;

    const jpeg = await params.loadJpeg();
    if (!jpeg) return null;
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', 'image/jpeg');
    form.append('file', new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }), 'product.jpg');
    try {
      const response = await fetch(this.authenticatedUrl(`${params.phoneNumberId}/media`, params), {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token(params.accessToken)}` },
        body: form,
        signal: AbortSignal.timeout(20_000),
      });
      const payload = (await response.json()) as { id?: string; error?: { message?: string } };
      if (!response.ok || !payload.id) {
        this.logger.warn(`WhatsApp media upload failed: HTTP ${response.status}`);
        return null;
      }
      if (this.mediaIds.size >= MEDIA_ID_CACHE_MAX) {
        this.mediaIds.delete(this.mediaIds.keys().next().value as string);
      }
      this.mediaIds.set(key, { id: payload.id, expiresAt: Date.now() + MEDIA_ID_TTL_MS });
      return payload.id;
    } catch (error) {
      this.logger.warn('WhatsApp media upload unavailable');
      return null;
    }
  }

  async sendTemplateMessage(params: {
    phoneNumberId: string;
    accessToken: string;
    appSecretEnc?: string;
    toPhone: string;
    templateName: string;
    languageCode: string;
    bodyParameters?: string[];
  }): Promise<{ messageId?: string; ok: boolean; error?: string; dryRun?: boolean }> {
    const components =
      params.bodyParameters && params.bodyParameters.length
        ? [
            {
              type: 'body',
              parameters: params.bodyParameters.map((text) => ({
                type: 'text',
                text,
              })),
            },
          ]
        : undefined;

    // Placeholder tokens cannot hit Graph — persist locally as dry-run success.
    if (
      isPlaceholderToken(params.accessToken)
    ) {
      return {
        ok: true,
        dryRun: true,
        messageId: `tpl_local_${Date.now()}`,
      };
    }

    return this.sendPayload({
      phoneNumberId: params.phoneNumberId,
      accessToken: params.accessToken, appSecretEnc: params.appSecretEnc,
      body: {
        messaging_product: 'whatsapp',
        to: params.toPhone.replace(/\D/g, ''),
        type: 'template',
        template: {
          name: params.templateName,
          language: { code: params.languageCode },
          ...(components ? { components } : {}),
        },
      },
    });
  }

  private async sendPayload(params: {
    phoneNumberId: string;
    accessToken: string;
    appSecretEnc?: string;
    body: Record<string, unknown>;
  }): Promise<{ messageId?: string; ok: boolean; error?: string }> {
    const url = this.authenticatedUrl(`${params.phoneNumberId}/messages`, params);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token(params.accessToken)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params.body),
      });

      const payload = (await response.json()) as {
        messages?: Array<{ id: string }>;
        error?: { message?: string };
      };

      if (!response.ok) {
        const error = `Meta rechazó el envío (HTTP ${response.status}). Revisa la conexión de WhatsApp.`;
        this.logger.warn(`WhatsApp send failed: ${error}`);
        return { ok: false, error };
      }

      return { ok: true, messageId: payload.messages?.[0]?.id };
    } catch (error) {
      const message = 'No pudimos enviar el mensaje a WhatsApp.';
      this.logger.error(`WhatsApp send exception: ${message}`);
      return { ok: false, error: message };
    }
  }
}
