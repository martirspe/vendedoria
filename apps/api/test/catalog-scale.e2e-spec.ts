import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { catalogDocument, catalogSearchWhere, searchCatalogIds } from '../src/catalog/catalog-search';
import { SalesAgentToolsService } from '../src/agent-runtime/sales-agent-tools.service';
import { catalogContext, CATALOG_CONTEXT_CHARS } from '../src/agent-runtime/catalog-context';
import type { PrismaService } from '../src/prisma/prisma.service';
import { StorefrontPublicService } from '../src/storefront/storefront-public.service';

describe('Indexed tenant catalog with 10,000 products (e2e)', () => {
  const db = new PrismaClient();
  const run = randomUUID();
  const tenantIds: string[] = [];
  let tenantId: string;
  let targetId: string;

  beforeAll(async () => {
    for (const suffix of ['main', 'other']) {
      const tenant = await db.tenant.create({ data: { name: 'Catalog scale fixture', slug: `scale-${run}-${suffix}` } });
      tenantIds.push(tenant.id);
    }
    tenantId = tenantIds[0];
    await db.$executeRaw(Prisma.sql`INSERT INTO "Product"
      (id, "tenantId", handle, name, "basePriceCents", categories, "isPublishedOnStore", "updatedAt")
      SELECT ${run} || '-' || n, ${tenantId}, 'fixture-' || n, 'Artículo ' || n, 1000,
        ARRAY['Pruebas'], true, now() FROM generate_series(1, 10000) n`);
    targetId = `${run}-10000`;
    await db.product.update({ where: { id: targetId }, data: {
      name: 'Lámpara Boreal', details: { keywords: ['farol'], compatibility: ['USB-C'], exclusions: ['No incluye adaptador'] },
    } });
    await db.product.create({ data: { tenantId: tenantIds[1], handle: 'other-lamp', name: 'Lámpara Boreal', basePriceCents: 1, details: { keywords: ['farol'] } } });
    await db.$executeRawUnsafe('ANALYZE "Product"');
  }, 60_000);

  afterAll(async () => {
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await db.$disconnect();
  });

  it('finds the last product by synonym and never mixes tenant catalogs', async () => {
    expect(await searchCatalogIds(db, tenantId, ['farol'], { available: true })).toEqual([targetId]);
    expect(await searchCatalogIds(db, tenantIds[1], ['farol'], { available: true })).not.toContain(targetId);
    expect(await searchCatalogIds(db, tenantId, ['farol'], { available: true, maxPriceCents: 999 })).toEqual([]);
  });

  it('bounds agent rows and context while reporting the actual full catalog count', async () => {
    const tools = new SalesAgentToolsService(db as PrismaService, null as never, new ConfigService());
    const products = await tools.listAvailableProducts(tenantId, [], [], 'quiero un farol');
    expect(products).toHaveLength(1);
    expect(products[0].id).toBe(targetId);
    expect(JSON.stringify(catalogContext(products, 'farol')).length).toBeLessThanOrEqual(CATALOG_CONTEXT_CHARS);
    expect((await tools.catalogOverview(tenantId)).total).toBe(10_000);
  });

  it('uses the GIN index and updates the index when the product information changes', async () => {
    const { where, query } = catalogSearchWhere(tenantId, ['farol'], { available: true });
    const plan = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT p.id FROM "Product" p WHERE ${where} ORDER BY ts_rank_cd(${catalogDocument}, ${query}) DESC LIMIT 12`);
    expect(JSON.stringify(plan)).toContain('Product_catalog_search_idx');
    const timings = plan[0]['QUERY PLAN'] as Array<{ 'Execution Time': number }>;
    console.info(`Catalog search: 10000 products; PostgreSQL execution ${timings[0]['Execution Time']} ms; returned 1 candidate.`);
    await db.product.update({ where: { id: targetId }, data: { details: { keywords: ['luminariaespecial'] } } });
    expect(await searchCatalogIds(db, tenantId, ['farol'])).toEqual([]);
    expect(await searchCatalogIds(db, tenantId, ['luminariaespecial'])).toEqual([targetId]);
  });

  it('paginates the complete store and resolves products outside its initial collection without exposing digital access', async () => {
    const store = new StorefrontPublicService(db as PrismaService, new ConfigService(), null as never, null as never);
    const access = { tenantId, isPreview: false };
    expect(await store.catalog(access)).toHaveLength(48);
    const found = await store.listProducts(access, { q: 'Lámpara', pageSize: 24 });
    expect(found.total).toBe(1);
    expect(found.items[0].handle).toBe('fixture-10000');
    expect((await store.listProducts(access, { page: 2, pageSize: 24 })).total).toBe(10000);
    await db.product.update({ where: { id: targetId }, data: { kind: 'DIGITAL', digitalAccessUrl: 'https://example.com/private-access' } });
    const product = await store.catalogProduct(access, 'fixture-10000');
    expect(product.kind).toBe('DIGITAL');
    expect(JSON.stringify(product)).not.toContain('private-access');
    await expect(store.catalogProduct(access, 'other-lamp')).rejects.toThrow('Product not found');
    await db.product.update({ where: { id: targetId }, data: { isPublishedOnStore: false } });
    await expect(store.catalogProduct(access, 'fixture-10000')).rejects.toThrow('Product not found');
  });
});
