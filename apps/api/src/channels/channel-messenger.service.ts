import { Injectable } from '@nestjs/common';
import { Channel } from '@prisma/client';
import { asInstagramMetadata, MetaInstagramClient } from './meta-instagram.client';
import { MetaWhatsAppClient } from './meta-whatsapp.client';
import { asWhatsAppMetadata } from './whatsapp-metadata';

export type ChannelSendResult = { ok: boolean; messageId?: string; error?: string };

const PAYMENT_BUTTON_TEXT = 'Pagar pedido';
const CTA_BODY_MAX = 1024;

/** Free-form messages through the channel a conversation belongs to (WhatsApp or Instagram). */
@Injectable()
export class ChannelMessengerService {
  constructor(
    private readonly metaWhatsApp: MetaWhatsAppClient,
    private readonly metaInstagram: MetaInstagramClient,
  ) {}

  /** Buyer address on the channel: the phone on WhatsApp, the thread id on Instagram. */
  recipientOf(
    channel: Pick<Channel, 'type'>,
    conversation: { contactPhone: string | null; externalThreadId: string | null },
  ): string | null {
    if (channel.type === 'TIKTOK_LIVE') return null;
    return channel.type === 'WHATSAPP' ? conversation.contactPhone : conversation.externalThreadId;
  }

  /** Null when the channel has no usable credentials. */
  async sendText(
    channel: Pick<Channel, 'type' | 'metadata'>,
    recipient: string,
    text: string,
  ): Promise<ChannelSendResult | null> {
    if (channel.type === 'WHATSAPP') {
      const metadata = asWhatsAppMetadata(channel.metadata);
      return metadata
        ? this.metaWhatsApp.sendTextMessage({
            phoneNumberId: metadata.phoneNumberId,
            accessToken: metadata.accessToken,
            toPhone: recipient,
            text,
          })
        : null;
    }
    if (channel.type === 'INSTAGRAM') {
      const metadata = asInstagramMetadata(channel.metadata);
      return metadata
        ? this.metaInstagram.sendTextMessage({
            accountId: metadata.accountId,
            accessToken: metadata.accessToken,
            recipientId: recipient,
            text,
          })
        : null;
    }
    return null;
  }

  /**
   * Payment link of an order (flow B). WhatsApp shows it as a "Pagar pedido" button under the
   * text; Instagram, a body over Meta's limit or a rejected interactive message fall back to
   * the text with the URL at the end, so the buyer always gets the link.
   */
  async sendPaymentLink(
    channel: Pick<Channel, 'type' | 'metadata'>,
    recipient: string,
    params: { text: string; url: string; footer?: string },
  ): Promise<ChannelSendResult | null> {
    const plain = `${params.text}\n\n${params.url}`;
    const metadata = channel.type === 'WHATSAPP' ? asWhatsAppMetadata(channel.metadata) : null;
    if (!metadata || params.text.length > CTA_BODY_MAX) {
      return this.sendText(channel, recipient, plain);
    }
    const send = await this.metaWhatsApp.sendCtaUrlMessage({
      phoneNumberId: metadata.phoneNumberId,
      accessToken: metadata.accessToken,
      toPhone: recipient,
      body: params.text,
      buttonText: PAYMENT_BUTTON_TEXT,
      url: params.url,
      footer: params.footer,
    });
    return send.ok ? send : this.sendText(channel, recipient, plain);
  }
}
