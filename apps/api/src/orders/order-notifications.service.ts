import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ChannelMessengerService } from '../channels/channel-messenger.service';
import { InboxEventsService } from '../conversations/inbox-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { DigitalAccess, digitalAccessOf } from './digital-access';
import { orderReference } from './settlement';

/** Meta only allows free-form messages within 24 hours of the buyer's last message. */
const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000;

export function paymentConfirmationText(
  order: {
    id: string;
    code: string | null;
    totalCents: number;
    currency: string;
  },
  access: DigitalAccess[] = [],
): string {
  const total = `${order.currency} ${(order.totalCents / 100).toFixed(2)}`;
  const text = `¡Recibimos tu pago de ${total}! Tu pedido ${orderReference(order)} quedó confirmado. Gracias por tu compra.`;
  const lines = access.map((item) =>
    [
      `• ${item.title}: ${item.url ?? 'te enviaremos el acceso por aquí.'}`,
      item.instructions,
    ]
      .filter(Boolean)
      .join('\n'),
  );
  return lines.length
    ? `${text}\n\nTu acceso a lo que compraste:\n${lines.join('\n')}`
    : text;
}

/** Messages to the buyer in the chat an order came from. */
@Injectable()
export class OrderNotificationsService {
  private readonly logger = new Logger(OrderNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messenger: ChannelMessengerService,
    private readonly inboxEvents: InboxEventsService,
  ) {}

  /**
   * Tells the buyer the payment arrived. Call it only when the order was settled just now, so
   * the buyer gets it once. A failed send never undoes the payment: it is logged without PII.
   */
  async paymentConfirmed(tenantId: string, orderId: string): Promise<void> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      select: {
        id: true,
        code: true,
        totalCents: true,
        currency: true,
        status: true,
        items: { select: { productId: true, title: true, fulfillment: true } },
        conversation: {
          select: {
            id: true,
            contactPhone: true,
            externalThreadId: true,
            lastInboundAt: true,
            channel: { select: { type: true, metadata: true } },
          },
        },
      },
    });
    const conversation = order?.conversation;
    if (!order || !conversation) return;
    if (!conversation.lastInboundAt || Date.now() - conversation.lastInboundAt.getTime() > MESSAGING_WINDOW_MS) {
      this.logger.log('Payment confirmation skipped: messaging window closed');
      return;
    }
    const recipient = this.messenger.recipientOf(conversation.channel, conversation);
    if (!recipient) return;

    const text = paymentConfirmationText(
      order,
      await digitalAccessOf(this.prisma, tenantId, order),
    );
    try {
      const send = await this.messenger.sendText(conversation.channel, recipient, text);
      if (!send?.ok) {
        this.logger.warn(`Payment confirmation not delivered: ${send?.error ?? 'channel without credentials'}`);
        return;
      }
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'OUTBOUND',
          authorType: 'SALES_AGENT',
          body: text,
          externalId: send.messageId,
          metadata: { kind: 'payment_confirmation', orderId: order.id } as Prisma.InputJsonValue,
        },
      });
      this.inboxEvents.publish(tenantId, conversation.id);
    } catch (error) {
      this.logger.warn(`Payment confirmation failed: ${error instanceof Error ? error.name : 'unknown error'}`);
    }
  }
}
