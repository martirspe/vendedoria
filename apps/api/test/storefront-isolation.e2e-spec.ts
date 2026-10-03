import { NotFoundException, ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { CatalogService } from '../src/catalog/catalog.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createPreviewToken } from '../src/storefront/storefront-preview';
import { StorefrontService } from '../src/storefront/storefront.service';

/**
 * Runs against the development database. Every row is created under
 * throwaway tenants and removed (cascade) at the end.
 */
describe('Storefront tenant isolation (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  const run = randomBytes(3).toString('hex');
  const slugA = `iso-a-${run}`;
  const slugB = `iso-b-${run}`;
  const slugDraft = `iso-draft-${run}`;
  const tenantIds: string[] = [];
  let draftTenantId = '';
  let tenantAId = '';
  let tenantBId = '';

  const get = (url: string, headers: Record<string, string> = {}) =>
    app.inject({ method: 'GET', url, headers });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);

    const createStore = async (
      slug: string,
      status: 'PUBLISHED' | 'DRAFT',
      products: Array<{ handle: string; published: boolean; category: string }>,
    ) => {
      const tenant = await prisma.tenant.create({
        data: {
          name: slug,
          slug,
          storefront: {
            create: { displayName: `Tienda ${slug}`, status, whatsappPhone: '51900000000' },
          },
          products: {
            create: products.map((item) => ({
              handle: item.handle,
              name: `Producto ${item.handle}`,
              basePriceCents: 1000,
              categories: [item.category],
              isPublishedOnStore: item.published,
            })),
          },
        },
      });
      tenantIds.push(tenant.id);
      return tenant.id;
    };

    tenantAId = await createStore(slugA, 'PUBLISHED', [
      { handle: 'a-visible', published: true, category: 'Solo A' },
      { handle: 'a-hidden', published: false, category: 'Oculta A' },
    ]);
    tenantBId = await createStore(slugB, 'PUBLISHED', [
      { handle: 'b-visible', published: true, category: 'Solo B' },
      { handle: 'b-hidden', published: false, category: 'Solo B' },
    ]);
    draftTenantId = await createStore(slugDraft, 'DRAFT', [
      { handle: 'draft-visible', published: true, category: 'Borrador' },
    ]);
  });

  afterAll(async () => {
    if (prisma && tenantIds.length) {
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
    await app?.close();
  });

  it('resolves only single-label hosts under the platform domain', async () => {
    const ok = await get(`/storefront/resolve?host=${slugA}.localhost:4300`);
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ slug: slugA, moved: false });
    expect((await get(`/storefront/resolve?host=${slugA}.evil.pe`)).statusCode).toBe(404);
    expect((await get(`/storefront/resolve?host=x.${slugA}.localhost`)).statusCode).toBe(404);
  });

  it('lists only the published products and categories of the requested store', async () => {
    const store = (await get(`/storefront/${slugA}`)).json();
    expect(store.slug).toBe(slugA);
    expect(store.categories).toEqual(['Solo A']);

    const list = (await get(`/storefront/${slugA}/products`)).json();
    expect(list.items.map((item: { handle: string }) => item.handle)).toEqual(['a-visible']);
    expect(list.total).toBe(1);
  });

  it('never serves a product of another tenant or an unpublished one', async () => {
    expect((await get(`/storefront/${slugA}/products/b-visible`)).statusCode).toBe(404);
    expect((await get(`/storefront/${slugB}/products/a-visible`)).statusCode).toBe(404);
    expect((await get(`/storefront/${slugA}/products/a-hidden`)).statusCode).toBe(404);
    const detail = await get(`/storefront/${slugB}/products/b-visible`);
    expect(detail.statusCode).toBe(200);
    expect(detail.json().related).toEqual([]);
  });

  it('hides draft stores unless the preview token belongs to that tenant', async () => {
    expect((await get(`/storefront/${slugDraft}`)).statusCode).toBe(404);
    expect((await get(`/storefront/${slugDraft}/products`)).statusCode).toBe(404);

    const secret = process.env.JWT_ACCESS_SECRET as string;
    const own = createPreviewToken(secret, draftTenantId).token;
    const foreign = createPreviewToken(secret, tenantAId).token;

    const preview = await get(`/storefront/${slugDraft}`, { 'x-store-preview': own });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().isPreview).toBe(true);
    expect(preview.headers['cache-control']).toBe('private, no-store');

    const wrong = await get(`/storefront/${slugDraft}`, { 'x-store-preview': foreign });
    expect(wrong.statusCode).toBe(404);
  });

  it('keeps store management behind authentication', async () => {
    expect((await get('/store')).statusCode).toBe(401);
  });

  it('shows available products in bulk only for the calling tenant', async () => {
    const view = await app.get(StorefrontService).showAvailableProducts(tenantBId);
    expect(view.publishedProducts).toBe(2);
    expect((await get(`/storefront/${slugB}/products/b-hidden`)).statusCode).toBe(200);
    expect((await get(`/storefront/${slugA}/products/a-hidden`)).statusCode).toBe(404);
  });

  it('deletes a product only inside the calling tenant', async () => {
    const catalog = app.get(CatalogService);
    const target = await prisma.product.findFirstOrThrow({
      where: { tenantId: tenantAId, handle: 'a-hidden' },
    });
    await expect(catalog.remove(tenantBId, target.id)).rejects.toThrow(NotFoundException);
    await expect(catalog.remove(tenantAId, target.id)).resolves.toEqual({ deleted: true });
    expect(await prisma.product.count({ where: { id: target.id } })).toBe(0);
  });
});
