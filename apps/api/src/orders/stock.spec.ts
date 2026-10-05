import type { Prisma } from '@prisma/client';
import { reserveStock, restoreStock } from './stock';

describe('variant inventory precedence', () => {
  const mock = (stockUnlimited = true, variantStock: number | null = 2) => ({
    product: { findUnique: jest.fn().mockResolvedValue({ id: 'p', stockUnlimited, stockQty: 8 }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn() },
    productVariant: { findFirst: jest.fn().mockResolvedValue({ id: 'v', stockQty: variantStock }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn() },
    productComponent: { findMany: jest.fn().mockResolvedValue([]) },
  });
  const lines = [{ productId: 'p', variantId: 'v', quantity: 2 }];
  it('reserves and restores explicit variant stock even when the product is unlimited', async () => {
    const tx = mock();
    await reserveStock(tx as unknown as Prisma.TransactionClient, lines);
    expect(tx.productVariant.updateMany).toHaveBeenCalledWith({ where: { id: 'v', stockQty: { gte: 2 } }, data: { stockQty: { decrement: 2 } } });
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    await restoreStock(tx as unknown as Prisma.TransactionClient, lines);
    expect(tx.productVariant.update).toHaveBeenCalledWith({ where: { id: 'v' }, data: { stockQty: { increment: 2 } } });
  });
  it('inherits only when the variant has no own count', async () => {
    const unlimited = mock(true, null);
    await reserveStock(unlimited as unknown as Prisma.TransactionClient, lines);
    expect(unlimited.productVariant.updateMany).not.toHaveBeenCalled();
    expect(unlimited.product.updateMany).not.toHaveBeenCalled();
    const tracked = mock(false, null);
    await reserveStock(tracked as unknown as Prisma.TransactionClient, lines);
    expect(tracked.product.updateMany).toHaveBeenCalled();
  });
  it('fails an atomic reservation after another order consumes the final units', async () => {
    const tx = mock(); tx.productVariant.updateMany.mockResolvedValue({ count: 0 });
    await expect(reserveStock(tx as unknown as Prisma.TransactionClient, lines)).rejects.toThrow('suficientes unidades');
  });
});
