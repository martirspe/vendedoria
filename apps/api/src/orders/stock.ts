import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type StockLine = {
  productId: string | null;
  variantId: string | null;
  quantity: number;
};

/**
 * Stock lives on the variant when the variant tracks it, otherwise on the product.
 * Products with `stockUnlimited` are never tracked.
 */
async function target(tx: Prisma.TransactionClient, line: StockLine) {
  if (!line.productId) return null;
  const product = await tx.product.findUnique({
    where: { id: line.productId },
    select: { id: true, stockUnlimited: true, stockQty: true },
  });
  if (!product || product.stockUnlimited) return null;
  if (line.variantId) {
    const variant = await tx.productVariant.findFirst({
      where: { id: line.variantId, productId: product.id },
      select: { id: true, stockQty: true },
    });
    if (variant?.stockQty != null) return { kind: 'variant' as const, id: variant.id };
  }
  return product.stockQty != null ? { kind: 'product' as const, id: product.id } : null;
}

/** Atomically takes units for a pending web order; throws 409 when they ran out. */
export async function reserveStock(tx: Prisma.TransactionClient, lines: StockLine[]) {
  for (const line of lines) {
    const where = await target(tx, line);
    if (!where) continue;
    const condition = { id: where.id, stockQty: { gte: line.quantity } };
    const data = { stockQty: { decrement: line.quantity } };
    const { count } =
      where.kind === 'variant'
        ? await tx.productVariant.updateMany({ where: condition, data })
        : await tx.product.updateMany({ where: condition, data });
    if (count === 0) {
      throw new ConflictException('No quedan suficientes unidades. Actualiza tu carrito.');
    }
  }
}

export async function restoreStock(tx: Prisma.TransactionClient, lines: StockLine[]) {
  for (const line of lines) {
    const where = await target(tx, line);
    if (!where) continue;
    const data = { stockQty: { increment: line.quantity } };
    if (where.kind === 'variant') {
      await tx.productVariant.update({ where: { id: where.id }, data });
    } else {
      await tx.product.update({ where: { id: where.id }, data });
    }
  }
}

/** For orders paid without a prior reservation (agent or manual): never below zero. */
export async function consumeStock(tx: Prisma.TransactionClient, lines: StockLine[]) {
  for (const line of lines) {
    const where = await target(tx, line);
    if (!where) continue;
    if (where.kind === 'variant') {
      await tx.$executeRaw`UPDATE "ProductVariant" SET "stockQty" = GREATEST("stockQty" - ${line.quantity}, 0) WHERE "id" = ${where.id}`;
    } else {
      await tx.$executeRaw`UPDATE "Product" SET "stockQty" = GREATEST("stockQty" - ${line.quantity}, 0) WHERE "id" = ${where.id}`;
    }
  }
}
