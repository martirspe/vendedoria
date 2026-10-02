import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MetaWhatsAppClient {
  private readonly logger = new Logger(MetaWhatsAppClient.name);

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
    const url = `https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`;
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
