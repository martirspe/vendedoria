import { randomBytes } from 'node:crypto';
import { CatalogService } from '../src/catalog/catalog.service';
import type { PlanLimitsService } from '../src/billing/plan-limits.service';
import type { MediaService } from '../src/catalog/media.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { reserveStock } from '../src/orders/stock';

/** Run only through test:docker, whose environment selects the isolated test database. */
const suite = process.env.RUN_ISOLATED_COMMERCE_TESTS === '1' ? describe : describe.skip;
suite('catalog commerce persistence (isolated PostgreSQL)', () => {
  const prisma = new PrismaService();
  const run = randomBytes(4).toString('hex');
  const tenants: string[] = [];
  let tenantId = '';
  let otherId = '';
  const catalog = new CatalogService(prisma, { assertCanCreateProduct: async () => undefined } as unknown as PlanLimitsService, { remove: async () => undefined } as unknown as MediaService);
  beforeAll(async () => {
    await prisma.$connect();
    const [{ name }] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (name !== 'vendedoria_test') throw new Error('Commerce persistence tests require the isolated vendedoria_test database.');
    for (const slug of [`commerce-${run}`, `commerce-other-${run}`]) {
      const tenant = await prisma.tenant.create({ data: { name: slug, slug, planTier: 'GROW', planTrial: false } });
      tenants.push(tenant.id);
    }
    [tenantId, otherId] = tenants;
  });
  afterAll(async () => {
    // Remove recipes before products because pieces use a restrictive FK.
    await prisma.productComponent.deleteMany({ where: { set: { tenantId: { in: tenants } } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
    await prisma.$disconnect();
  });
  it('creates, edits and reloads set pieces without changing identity or crossing tenants', async () => {
    const first = await catalog.create(tenantId, { name: 'Primera pieza', handle: 'first', basePriceCents: 1000 });
    const second = await catalog.create(tenantId, { name: 'Segunda pieza', handle: 'second', basePriceCents: 2000 });
    const set = await catalog.create(tenantId, { name: 'Set', handle: 'set', basePriceCents: 4000, components: [{ productId: first.id, quantity: 2 }] });
    const loaded = await catalog.getById(tenantId, set.id);
    expect(loaded.components[0].componentId).toBe(first.id);
    await catalog.update(tenantId, set.id, { components: [{ productId: second.id, quantity: 3 }] });
    const edited = await catalog.getById(tenantId, set.id);
    expect(edited.components).toHaveLength(1); expect(edited.components[0]).toMatchObject({ componentId: second.id, quantity: 3 });
    await expect(catalog.getById(otherId, set.id)).rejects.toThrow('no encontrado');
    await expect(catalog.update(tenantId, set.id, { components: [{ productId: 'missing', quantity: 1 }] })).rejects.toThrow('no existe');
    expect((await catalog.getById(tenantId, set.id)).components[0].componentId).toBe(second.id);
    await catalog.update(tenantId, set.id, { components: [] });
    expect((await catalog.getById(tenantId, set.id)).components).toHaveLength(0);
  });
  it('preserves variant IDs and values across edits and reserves their independent stock atomically', async () => {
    const options = ['Color', 'Talla', 'Material', 'Capacidad', 'Modelo'].map((name) => ({ name, value: 'A' }));
    const product = await catalog.create(tenantId, { name: 'Variantes', handle: 'variants', basePriceCents: 10000, stockUnlimited: true, variants: [{ options, priceCents: 9000, stockQty: 1, sku: `sku-${run}`, imageUrl: 'https://cdn.example/image.webp' }] });
    const variant = product.variants[0];
    const edited = await catalog.update(tenantId, product.id, { variants: [{ id: variant.id, options, priceCents: 9500, stockQty: 1, sku: `sku-${run}`, imageUrl: variant.imageUrl }] });
    expect(edited.variants[0]).toMatchObject({ id: variant.id, options, priceCents: 9500, stockQty: 1, imageUrl: variant.imageUrl });
    const competing = await Promise.allSettled([1, 2].map(() => prisma.$transaction((tx) => reserveStock(tx, [{ productId: product.id, variantId: variant.id, quantity: 1 }]))));
    expect(competing.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await catalog.getById(tenantId, product.id)).variants[0].stockQty).toBe(0);
    await catalog.update(tenantId, product.id, { variants: [{ id: variant.id, options, priceCents: 9500, isAvailable: false, stockQty: 0 }] });
    expect((await catalog.getById(tenantId, product.id)).variants[0].isAvailable).toBe(false);
  });
});
