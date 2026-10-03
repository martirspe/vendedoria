import { Injectable } from '@nestjs/common';
import { Channel } from '@prisma/client';
import { asInstagramMetadata, MetaInstagramClient } from './meta-instagram.client';
import { MetaWhatsAppClient } from './meta-whatsapp.client';
import { asWhatsAppMetadata } from './whatsapp-metadata';

export type ChannelSendResult = { ok: boolean; messageId?: string; error?: string };

/** Free-form text through the channel a conversation belongs to (WhatsApp or Instagram). */
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
}
