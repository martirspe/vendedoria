import { Order, OrderItem, Prisma } from '@prisma/client';
import { consumeStock, restoreStock } from './stock';

type SettlementOrder = Pick<
  Order,
  'id' | 'status' | 'stockState' | 'conversationId' | 'totalCents' | 'currency' | 'code'
> & { items: Pick<OrderItem, 'productId' | 'variantId' | 'quantity' | 'allocations'>[] };

export function orderReference(order: Pick<Order, 'id' | 'code'>): string {
  return order.code ?? order.id.slice(-6).toUpperCase();
}

/**
 * Applies a confirmed payment once: reserved units become sold (unreserved ones are
 * consumed), the coupon use is confirmed and the conversation is marked as a sale.
 */
export async function settlePaidOrder(
  tx: Prisma.TransactionClient,
  order: SettlementOrder,
  detail?: string,
): Promise<boolean> {
  if (order.status === 'PAID' || order.status === 'CANCELLED') {
    return false;
  }
  if (order.stockState === 'none') {
    await consumeStock(tx, order.items);
  }
  await tx.couponRedemption.updateMany({
    where: { orderId: order.id, status: 'HELD' },
    data: { status: 'CONFIRMED' },
  });
  await tx.order.update({
    where: { id: order.id },
    data: {
      status: 'PAID',
      stockState: order.stockState === 'released' ? 'released' : 'sold',
      paymentState: null,
      ...(detail ? { paymentDetail: detail.slice(0, 100) } : {}),
    },
  });
  await tx.paymentEvent.create({
    data: { orderId: order.id, status: 'paid', detail: detail?.slice(0, 100) },
  });
  if (order.conversationId) {
    await tx.conversation.update({
      where: { id: order.conversationId },
      data: { markedAsSale: true },
    });
    await tx.message.create({
      data: {
        conversationId: order.conversationId,
        direction: 'OUTBOUND',
        authorType: 'SYSTEM',
        body: `Pago confirmado · pedido ${orderReference(order)} · ${(order.totalCents / 100).toFixed(2)} ${order.currency}`,
      },
    });
  }
  return true;
}

/** Returns reserved or sold units; an unpaid coupon use is freed (paid ones stay counted). */
export async function releaseOrder(
  tx: Prisma.TransactionClient,
  order: SettlementOrder,
  reason: string,
  paymentState?: string,
): Promise<void> {
  if (order.stockState === 'held' || order.stockState === 'sold') {
    await restoreStock(tx, order.items);
  }
  await tx.couponRedemption.updateMany({
    where: { orderId: order.id, status: 'HELD' },
    data: { status: 'RELEASED' },
  });
  await tx.order.update({
    where: { id: order.id },
    data: {
      status: 'CANCELLED',
      stockState: order.stockState === 'none' ? 'none' : 'released',
      cancelReason: reason,
      ...(paymentState ? { paymentState } : {}),
    },
  });
  await tx.paymentEvent.create({
    data: { orderId: order.id, status: paymentState ?? 'cancelled', detail: reason },
  });
}
