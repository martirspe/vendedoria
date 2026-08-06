import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MetaWhatsAppClient {
  private readonly logger = new Logger(MetaWhatsAppClient.name);

  async sendTextMessage(params: {
    phoneNumberId: string;
    accessToken: string;
    toPhone: string;
    text: string;
  }): Promise<{ messageId?: string; ok: boolean; error?: string }> {
    const url = `https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: params.toPhone.replace(/\D/g, ''),
          type: 'text',
          text: { body: params.text },
        }),
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
