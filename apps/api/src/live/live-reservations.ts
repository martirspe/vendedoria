import { ConflictException, NotFoundException } from '@nestjs/common';
import { LiveReservation, Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { restoreStock, StockLine } from '../orders/stock';

export type ReservedLiveLine = StockLine & {
  productId: string;
  handle: string;
  title: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
};

export function reservedLine(value: Prisma.JsonValue): ReservedLiveLine {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ConflictException('La reserva no tiene un producto válido.');
  const line = value as unknown as ReservedLiveLine;
  if (
    !line.productId ||
    !line.handle ||
    !Number.isInteger(line.quantity) ||
    !Number.isInteger(line.unitCents)
  )
    throw new ConflictException('La reserva no tiene un producto válido.');
  return line;
}

export function liveReservationToken(
  secret: string,
  reservation: Pick<LiveReservation, 'id' | 'tenantId' | 'expiresAt'>,
): string {
  const payload = `${reservation.id}.${reservation.expiresAt.getTime()}`;
  return `${payload}.${createHmac('sha256', secret).update(`live:${reservation.tenantId}:${payload}`).digest('base64url')}`;
}

export function liveReservationId(
  secret: string,
  tenantId: string,
  token: string,
): string | null {
  const match = /^([a-z0-9]{20,40})\.(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(
    token,
  );
  if (!match || Number(match[2]) <= Date.now()) return null;
  const expected = createHmac('sha256', secret)
    .update(`live:${tenantId}:${match[1]}.${match[2]}`)
    .digest();
  const signature = Buffer.from(match[3], 'base64url');
  return signature.length === expected.length &&
    timingSafeEqual(signature, expected)
    ? match[1]
    : null;
}

/** Serialize checkout transfer, cancellation and expiry on the same reservation row. */
export async function lockLiveReservation(
  tx: Prisma.TransactionClient,
  tenantId: string,
  id: string,
) {
  await tx.$queryRaw`SELECT "id" FROM "LiveReservation" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
  const reservation = await tx.liveReservation.findFirst({
    where: { id, tenantId },
  });
  if (!reservation) throw new NotFoundException('Esta reserva no existe.');
  return reservation;
}

export async function liveBusinessEvent(
  tx: Prisma.TransactionClient,
  reservation: LiveReservation,
  kind: string,
): Promise<void> {
  await tx.liveEvent.createMany({
    data: {
      tenantId: reservation.tenantId,
      sessionId: reservation.sessionId,
      kind,
      reservationId: reservation.id,
      externalEventId: `${kind}:${reservation.id}`,
    },
    skipDuplicates: true,
  });
}

export async function releasePendingLiveReservation(
  tx: Prisma.TransactionClient,
  reservation: LiveReservation,
  status: 'EXPIRED' | 'CANCELLED',
): Promise<boolean> {
  if (reservation.status !== 'PENDING' || reservation.orderId) return false;
  await tx.liveOffer.updateMany({
    where: { id: reservation.offerId, tenantId: reservation.tenantId },
    data: { claimedQty: { decrement: reservation.quantity } },
  });
  await restoreStock(tx, [reservedLine(reservation.line)]);
  await tx.liveReservation.updateMany({
    where: {
      id: reservation.id,
      tenantId: reservation.tenantId,
      status: 'PENDING',
    },
    data: { status },
  });
  await liveBusinessEvent(
    tx,
    reservation,
    status === 'EXPIRED'
      ? 'live_reservation_expired'
      : 'live_reservation_cancelled',
  );
  return true;
}

/** Runs inside the existing order settlement transaction; inventory was already taken. */
export async function settleLiveReservation(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const reservation = await tx.liveReservation.findFirst({
    where: { orderId, status: 'CHECKED_OUT' },
  });
  if (!reservation) return;
  const changed = await tx.liveReservation.updateMany({
    where: {
      id: reservation.id,
      tenantId: reservation.tenantId,
      status: 'CHECKED_OUT',
    },
    data: { status: 'CONVERTED' },
  });
  if (changed.count) await liveBusinessEvent(tx, reservation, 'live_purchase');
}

/** Existing order release returns inventory; this releases only the LIVE allocation. */
export async function releaseLiveOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  expired: boolean,
): Promise<void> {
  const reservation = await tx.liveReservation.findFirst({
    where: { orderId, status: { in: ['CHECKED_OUT', 'CONVERTED'] } },
  });
  if (!reservation) return;
  const status = expired ? 'EXPIRED' : 'CANCELLED';
  const changed = await tx.liveReservation.updateMany({
    where: {
      id: reservation.id,
      tenantId: reservation.tenantId,
      status: reservation.status,
    },
    data: { status },
  });
  if (!changed.count) return;
  await tx.liveOffer.updateMany({
    where: { id: reservation.offerId, tenantId: reservation.tenantId },
    data: { claimedQty: { decrement: reservation.quantity } },
  });
  await liveBusinessEvent(
    tx,
    reservation,
    expired ? 'live_reservation_expired' : 'live_reservation_cancelled',
  );
}
