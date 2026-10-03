import { Injectable, Logger } from '@nestjs/common';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
/** Meta keeps uploaded media for 30 days; ids are reused well inside that window. */
const MEDIA_ID_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MEDIA_ID_CACHE_MAX = 500;

function isPlaceholderToken(token: string): boolean {
  return token.length < 20 || /placeholder|replace|demo|test/i.test(token);
}

@Injectable()
export class MetaWhatsAppClient {
  private readonly logger = new Logger(MetaWhatsAppClient.name);
  private readonly mediaIds = new Map<string, { id: string; expiresAt: number }>();

  async verifyCredentials(params: {
    phoneNumberId: string;
    accessToken: string;
  }): Promise<{ ok: boolean; displayName?: string; error?: string }> {
    if (
      params.accessToken.length < 20 ||
      /placeholder|replace|demo|test/i.test(params.accessToken)
    ) {
      return { ok: true, displayName: 'Token local (modo demo)' };
    }

    const url = `https://graph.facebook.com/v21.0/${params.phoneNumberId}?fields=display_phone_number,verified_name`;
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${params.accessToken}` },
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
    toPhone: string;
    text: string;
  }): Promise<{ messageId?: string; ok: boolean; error?: string }> {
    return this.sendPayload({
      phoneNumberId: params.phoneNumberId,
      accessToken: params.accessToken,
      body: {
        messaging_product: 'whatsapp',
        to: params.toPhone.replace(/\D/g, ''),
        type: 'text',
        text: { body: params.text },
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
      accessToken: params.accessToken,
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
      const response = await fetch(`${GRAPH_BASE}/${params.phoneNumberId}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${params.accessToken}` },
        body: form,
        signal: AbortSignal.timeout(20_000),
      });
      const payload = (await response.json()) as { id?: string; error?: { message?: string } };
      if (!response.ok || !payload.id) {
        this.logger.warn(`WhatsApp media upload failed: ${payload.error?.message ?? `HTTP ${response.status}`}`);
        return null;
      }
      if (this.mediaIds.size >= MEDIA_ID_CACHE_MAX) {
        this.mediaIds.delete(this.mediaIds.keys().next().value as string);
      }
      this.mediaIds.set(key, { id: payload.id, expiresAt: Date.now() + MEDIA_ID_TTL_MS });
      return payload.id;
    } catch (error) {
      this.logger.warn(`WhatsApp media upload exception: ${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    }
  }

  async sendTemplateMessage(params: {
    phoneNumberId: string;
    accessToken: string;
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
      params.accessToken.length < 20 ||
      /placeholder|replace|demo|test/i.test(params.accessToken)
    ) {
      return {
        ok: true,
        dryRun: true,
        messageId: `tpl_local_${Date.now()}`,
      };
    }

    return this.sendPayload({
      phoneNumberId: params.phoneNumberId,
      accessToken: params.accessToken,
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
    body: Record<string, unknown>;
  }): Promise<{ messageId?: string; ok: boolean; error?: string }> {
    const url = `${GRAPH_BASE}/${params.phoneNumberId}/messages`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params.body),
      });

      const payload = (await response.json()) as {
        messages?: Array<{ id: string }>;
        error?: { message?: string };
      };

      if (!response.ok) {
        const error = payload.error?.message ?? `HTTP ${response.status}`;
        this.logger.warn(`WhatsApp send failed: ${error}`);
        return { ok: false, error };
      }

      return { ok: true, messageId: payload.messages?.[0]?.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`WhatsApp send exception: ${message}`);
      return { ok: false, error: message };
    }
  }
}
