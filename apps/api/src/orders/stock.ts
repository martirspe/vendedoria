import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Units of a set piece taken for one order line. */
export type Allocation = { productId: string; quantity: number };

export type StockLine = {
  productId: string | null;
  variantId: string | null;
  quantity: number;
  /** Snapshot of the set pieces taken at reservation (OrderItem.allocations). */
  allocations?: Prisma.JsonValue | Allocation[] | null;
};

function snapshot(value: StockLine['allocations']): Allocation[] | null {
  if (!Array.isArray(value)) return null;
  const rows = (value as unknown[]).filter(
    (row): row is Allocation =>
      typeof row === 'object' &&
      row !== null &&
      typeof (row as Allocation).productId === 'string' &&
      Number.isInteger((row as Allocation).quantity) &&
      (row as Allocation).quantity > 0,
  );
  return rows.length ? rows : null;
}

/**
 * Lines of products sold as sets become their pieces. A stored snapshot wins over the
 * current recipe so a set edited after the sale returns exactly what was taken.
 */
export async function withAllocations<T extends StockLine>(
  tx: Prisma.TransactionClient,
  lines: T[],
): Promise<Array<T & { allocations: Allocation[] | null }>> {
  const pending = lines.filter((line) => line.productId && !snapshot(line.allocations));
  const recipes = pending.length
    ? await tx.productComponent.findMany({
        where: { setId: { in: pending.map((line) => line.productId as string) } },
        select: { setId: true, componentId: true, quantity: true },
        orderBy: { componentId: 'asc' },
      })
    : [];
  return lines.map((line) => {
    const stored = snapshot(line.allocations);
    if (stored) return { ...line, allocations: stored };
    const pieces = recipes.filter((row) => row.setId === line.productId);
    return {
      ...line,
      allocations: pieces.length
        ? pieces.map((row) => ({ productId: row.componentId, quantity: row.quantity * line.quantity }))
        : null,
    };
  });
}

/** Set lines are replaced by one product-level line per piece. */
async function expand(tx: Prisma.TransactionClient, lines: StockLine[]): Promise<StockLine[]> {
  return (await withAllocations(tx, lines)).flatMap((line): StockLine[] =>
    line.allocations
      ? line.allocations.map((a) => ({ productId: a.productId, variantId: null, quantity: a.quantity }))
      : [line],
  );
}

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
  for (const line of await expand(tx, lines)) {
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
  for (const line of await expand(tx, lines)) {
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
  for (const line of await expand(tx, lines)) {
    const where = await target(tx, line);
    if (!where) continue;
    if (where.kind === 'variant') {
      await tx.$executeRaw`UPDATE "ProductVariant" SET "stockQty" = GREATEST("stockQty" - ${line.quantity}, 0) WHERE "id" = ${where.id}`;
    } else {
      await tx.$executeRaw`UPDATE "Product" SET "stockQty" = GREATEST("stockQty" - ${line.quantity}, 0) WHERE "id" = ${where.id}`;
    }
  }
}
