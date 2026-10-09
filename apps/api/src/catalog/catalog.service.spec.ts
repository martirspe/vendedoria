import type { PlanLimitsService } from '../billing/plan-limits.service';
import type { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from './catalog.service';
import type { MediaService } from './media.service';

const CDN = 'https://cdn.example.pe/media/tenant-a';
const ONLY_HERE = `${CDN}/${'a'.repeat(32)}.webp`;
const SHARED = `${CDN}/${'b'.repeat(32)}.webp`;
const STORE_LOGO = `${CDN}/${'c'.repeat(32)}.webp`;
const VARIANT_ONLY = `${CDN}/${'d'.repeat(32)}.webp`;

describe('CatalogService inventory images', () => {
  it('uses the tenant-scoped main product image for base rows and variants, with null for missing photos', async () => {
    const product = { id: 'product-1', name: 'Producto', sku: 'SKU', stockUnlimited: false, stockQty: 3,
      media: [{ url: ONLY_HERE }], variants: [], _count: { components: 0, componentOf: 0 } };
    const prisma = { product: { findMany: jest.fn().mockResolvedValue([
      product,
      { ...product, id: 'variant-product', variants: [{ id: 'variant-1', sku: 'VAR', stockQty: 2, options: [{ name: 'Talla', value: 'S' }] }] },
      { ...product, id: 'no-photo', media: [] },
      { ...product, id: 'set', _count: { components: 2, componentOf: 0 } },
    ]) } };
    const service = new CatalogService(prisma as unknown as PrismaService, {} as PlanLimitsService, {} as MediaService);
    const result = await service.inventory('tenant-a');
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a', kind: 'PRODUCT' },
      select: expect.objectContaining({ media: { where: { kind: { not: 'related' } }, orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } } }),
    }));
    expect(result.map(row => row.imageUrl)).toEqual([ONLY_HERE, ONLY_HERE, null]);
    expect(result[1].variantId).toBe('variant-1');
  });
});

describe('CatalogService photo cleanup', () => {
  it('deletes only the photos of a removed product that nothing else of the tenant uses', async () => {
    const prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'product-1',
          media: [{ url: ONLY_HERE }, { url: SHARED }, { url: STORE_LOGO }],
          variants: [{ imageUrl: VARIANT_ONLY }, { imageUrl: null }],
          _count: { componentOf: 0 },
        }),
        delete: jest.fn().mockResolvedValue({}),
      },
      productMedia: { findMany: jest.fn().mockResolvedValue([{ url: SHARED }]) },
      productVariant: { findMany: jest.fn().mockResolvedValue([]) },
      storefront: { findUnique: jest.fn().mockResolvedValue({ tenantId: 'tenant-a', logoUrl: STORE_LOGO }) },
    };
    const media = { remove: jest.fn().mockResolvedValue(undefined) };
    const service = new CatalogService(
      prisma as unknown as PrismaService,
      {} as PlanLimitsService,
      media as unknown as MediaService,
    );

    await expect(service.remove('tenant-a', 'product-1')).resolves.toEqual({ deleted: true });

    expect(prisma.productMedia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ product: { tenantId: 'tenant-a' } }) }),
    );
    expect(media.remove).toHaveBeenCalledWith('tenant-a', [ONLY_HERE, VARIANT_ONLY]);
  });

  it('keeps the photos when the product cannot be deleted', async () => {
    const prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'product-1',
          media: [{ url: ONLY_HERE }],
          variants: [],
          _count: { componentOf: 1 },
        }),
      },
    };
    const media = { remove: jest.fn() };
    const service = new CatalogService(
      prisma as unknown as PrismaService,
      {} as PlanLimitsService,
      media as unknown as MediaService,
    );

    await expect(service.remove('tenant-a', 'product-1')).rejects.toThrow();
    expect(media.remove).not.toHaveBeenCalled();
  });
});
