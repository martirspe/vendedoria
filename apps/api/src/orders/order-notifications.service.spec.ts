import type { ChannelMessengerService } from '../channels/channel-messenger.service';
import type { InboxEventsService } from '../conversations/inbox-events.service';
import type { PrismaService } from '../prisma/prisma.service';
import { OrderNotificationsService, paymentConfirmationText } from './order-notifications.service';

const order = (lastInboundAt: Date | null, conversation = true) => ({
  id: 'order1',
  code: 'W7K2QD',
  totalCents: 28_800,
  currency: 'PEN',
  status: 'PAID' as const,
  items: [],
  conversation: conversation
    ? {
        id: 'conv1',
        contactPhone: '51900000000',
        externalThreadId: '51900000000',
        lastInboundAt,
        channel: { type: 'WHATSAPP', metadata: {} },
      }
    : null,
});

function setup(found: ReturnType<typeof order> | null, send = { ok: true, messageId: 'wamid.1' }) {
  const prisma = {
    order: { findFirst: jest.fn().mockResolvedValue(found) },
    message: { create: jest.fn().mockResolvedValue({}) },
  };
  const messenger = {
    recipientOf: jest.fn().mockReturnValue('51900000000'),
    sendText: jest.fn().mockResolvedValue(send),
  };
  const inbox = { publish: jest.fn() };
  const service = new OrderNotificationsService(
    prisma as unknown as PrismaService,
    messenger as unknown as ChannelMessengerService,
    inbox as unknown as InboxEventsService,
  );
  return { service, prisma, messenger, inbox };
}

describe('OrderNotificationsService', () => {
  it('writes the confirmation with the real total and order reference', () => {
    expect(paymentConfirmationText(order(null))).toBe(
      '¡Recibimos tu pago de PEN 288.00! Tu pedido W7K2QD quedó confirmado. Gracias por tu compra.',
    );
  });

  it('adds the digital access to the confirmation', () => {
    expect(
      paymentConfirmationText(order(null), [
        { title: 'Guía', url: 'https://example.com/guia', instructions: 'Descarga el PDF.' },
        { title: 'Curso', url: null, instructions: null },
      ]),
    ).toBe(
      '¡Recibimos tu pago de PEN 288.00! Tu pedido W7K2QD quedó confirmado. Gracias por tu compra.\n\n' +
        'Tu acceso a lo que compraste:\n' +
        '• Guía: https://example.com/guia\nDescarga el PDF.\n' +
        '• Curso: te enviaremos el acceso por aquí.',
    );
  });

  it('confirms the payment in the chat the order came from and records it', async () => {
    const { service, prisma, messenger, inbox } = setup(order(new Date()));
    await service.paymentConfirmed('tenant1', 'order1');
    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'order1', tenantId: 'tenant1' } }),
    );
    expect(messenger.sendText).toHaveBeenCalledTimes(1);
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: 'conv1',
        authorType: 'SALES_AGENT',
        externalId: 'wamid.1',
        metadata: { kind: 'payment_confirmation', orderId: 'order1' },
      }),
    });
    expect(inbox.publish).toHaveBeenCalledWith('tenant1', 'conv1');
  });

  it('stays silent outside the 24-hour window, without a chat or when sending fails', async () => {
    const closed = setup(order(new Date(Date.now() - 25 * 60 * 60 * 1000)));
    await closed.service.paymentConfirmed('tenant1', 'order1');
    expect(closed.messenger.sendText).not.toHaveBeenCalled();

    const noChat = setup(order(new Date(), false));
    await noChat.service.paymentConfirmed('tenant1', 'order1');
    expect(noChat.messenger.sendText).not.toHaveBeenCalled();

    const failed = setup(order(new Date()), { ok: false, messageId: '' });
    await failed.service.paymentConfirmed('tenant1', 'order1');
    expect(failed.prisma.message.create).not.toHaveBeenCalled();
  });
});
