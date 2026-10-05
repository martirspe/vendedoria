import type { PrismaService } from '../prisma/prisma.service';
import type { PlanLimitsService } from '../billing/plan-limits.service';
import type { MediaService } from './media.service';
import { CatalogService } from './catalog.service';

describe('catalog variant validation and persistence', () => {
  const variant = { options: [{ name: 'Color', value: 'Negro' }, { name: 'Talla', value: '38' }], priceCents: 10000, sku: 'SHOE-1', stockQty: 2 };
  const setup = () => {
    const current = { id: 'p', kind: 'PRODUCT', digitalAccessUrl: null, isAvailable: true, updatedAt: new Date('2026-10-05T12:00:00Z'), categoryId: null, attributeValues: null, basePriceCents: 10000, variants: [], components: [], media: [] };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      product: { create: jest.fn().mockResolvedValue(current), findFirstOrThrow: jest.fn().mockResolvedValue(current), findUniqueOrThrow: jest.fn().mockResolvedValue(current), update: jest.fn().mockResolvedValue(current) },
      productVariant: { count: jest.fn().mockResolvedValue(0), deleteMany: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), create: jest.fn(), createMany: jest.fn() },
      productComponent: { count: jest.fn().mockResolvedValue(0) },
    };
    const prisma = { $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)), product: { findFirst: jest.fn().mockResolvedValue(current) } };
    const limits = { assertCanCreateProduct: jest.fn() };
    const service = new CatalogService(prisma as unknown as PrismaService, limits as unknown as PlanLimitsService, {} as MediaService);
    return { service, tx, current, prisma, limits };
  };
  it('creates combinations with independent stock and materialized inherited prices', async () => {
    const { service, tx } = setup();
    await service.create('a', { name: 'Shoe', handle: 'shoe', basePriceCents: 12000, variants: [{ ...variant, priceInherited: true }] });
    const data = tx.product.create.mock.calls[0][0].data;
    expect(data.tenantId).toBe('a');
    expect(data.variants.create[0]).toMatchObject({ priceCents: 12000, priceInherited: true, stockQty: 2, option1Name: 'Color', option2Value: '38', options: variant.options });
  });
  it('rejects repeated combinations, SKUs, IDs and inconsistent axes before writing', async () => {
    const { service, tx } = setup();
    await expect(service.create('a', { name: 'Shoe', handle: 'shoe', basePriceCents: 10000, variants: [variant, { ...variant, sku: 'other' }] })).rejects.toThrow('repetidas');
    await expect(service.create('a', { name: 'Shoe', handle: 'shoe', basePriceCents: 10000, variants: [variant, { ...variant, options: [{ name: 'Color', value: 'Blanco' }, { name: 'Talla', value: '38' }] }] })).rejects.toThrow('SKU distinto');
    await expect(service.update('a', 'p', { variants: [{ ...variant, id: 'v' }, { ...variant, id: 'v', sku: 'other', options: [{ name: 'Color', value: 'Blanco' }, { name: 'Talla', value: '39' }] }] })).rejects.toThrow('más de una vez');
    await expect(service.update('a', 'p', { variants: [variant, { ...variant, options: [{ name: 'Material', value: 'Cuero' }] }] })).rejects.toThrow('mismos atributos');
    expect(tx.product.create).not.toHaveBeenCalled();
  });
  it('rejects foreign or deleted variant IDs before deleting any existing combination', async () => {
    const { service, tx } = setup();
    await expect(service.update('a', 'p', { variants: [{ ...variant, id: 'foreign' }] })).rejects.toThrow('otro producto');
    expect(tx.productVariant.count).toHaveBeenCalledWith({ where: { productId: 'p', id: { in: ['foreign'] } } });
    expect(tx.productVariant.deleteMany).not.toHaveBeenCalled();
  });
  it('updates an existing variant in place and can explicitly remove all variants', async () => {
    const { service, tx } = setup();
    tx.productVariant.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await service.update('a', 'p', { variants: [{ ...variant, id: 'v', stockQty: 3, isAvailable: false }] });
    expect(tx.productVariant.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'v', productId: 'p' }, data: expect.objectContaining({ stockQty: 3, isAvailable: false }) }));
    expect(tx.productVariant.create).not.toHaveBeenCalled();
    tx.productVariant.count.mockResolvedValue(0);
    await service.update('a', 'p', { variants: [] });
    expect(tx.productVariant.deleteMany).toHaveBeenLastCalledWith({ where: { productId: 'p', id: { notIn: [] } } });
  });
  it('does not recreate a variant or overwrite stock after a concurrent reservation', async () => {
    const { service, tx } = setup();
    tx.productVariant.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    tx.productVariant.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(service.update('a', 'p', { variants: [{ ...variant, id: 'v', expectedStockQty: 2 }] })).rejects.toThrow('stock actualizado');
    expect(tx.productVariant.create).not.toHaveBeenCalled();
    expect(tx.productVariant.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'v', productId: 'p', stockQty: 2 } }));
  });
  it('inserts a generated catalog of 500 new combinations in one batch', async () => {
    const { service, tx } = setup();
    await service.update('a', 'p', { variants: Array.from({ length: 500 }, (_, index) => ({ ...variant, sku: `SKU-${index}`, options: [{ name: 'Color', value: `Color ${index}` }] })) });
    expect(tx.productVariant.createMany).toHaveBeenCalledTimes(1);
    expect(tx.productVariant.createMany.mock.calls[0][0].data).toHaveLength(500);
    expect(tx.productVariant.create).not.toHaveBeenCalled();
  });
  it('rejects stale edits and removal of a variant held by an unpaid order', async () => {
    const { service, tx } = setup();
    await expect(service.update('a', 'p', { expectedUpdatedAt: '2026-10-04T12:00:00Z', name: 'stale' })).rejects.toThrow('cambió');
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    tx.productVariant.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    await expect(service.update('a', 'p', { variants: [] })).rejects.toThrow('reservadas');
    expect(tx.productVariant.deleteMany).not.toHaveBeenCalled();
  });
});
