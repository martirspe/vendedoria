import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorefrontEditorService } from '../src/storefront/storefront-editor.service';
import type { StoreEditorView } from '../src/storefront/storefront-editor.service';

const isolated = process.env.RUN_ISOLATED_COMMERCE_TESTS === '1';
(isolated ? describe : describe.skip)('Theme lifecycle on isolated PostgreSQL', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let editor: StorefrontEditorService;
  const tenantIds: string[] = [];
  const userIds: string[] = [];
  const run = randomBytes(4).toString('hex');
  let counter = 0;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('/vendedoria_test')) throw new Error('Theme E2E requires the isolated test database.');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    editor = app.get(StorefrontEditorService);
  }, 30_000);

  afterAll(async () => {
    if (prisma && tenantIds.length) await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    if (prisma && userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app?.close();
  }, 30_000);

  async function fixture(industry = 'general', template = 'classic') {
    const slug = `theme-${run}-${++counter}`;
    const tenant = await prisma.tenant.create({ data: {
      name: 'Theme test merchant', slug,
      integrations: { create: { key: 'store' } },
      storefront: { create: {
        displayName: 'Mi comercio', industry, template, status: 'PUBLISHED', whatsappPhone: '51900000000',
        brandColor: '#203040', accentColor: '#506070', seoTitle: 'Mi título SEO', pickupAddress: 'Dirección de prueba',
        templateContent: { version: 1, sections: { hero: { title: 'Mi portada', text: '' }, announcement: { text: 'Aviso propio' } }, theme: { primary: '#102030' } },
      } },
      products: { create: { handle: 'real-product', name: 'Producto propio', basePriceCents: 12000, stockQty: 7, categories: ['Mi categoría'], isPublishedOnStore: true } },
      orders: { create: { status: 'PAID', totalCents: 12000, subtotalCents: 12000, customerName: 'Cliente de prueba', customerEmail: 'buyer@example.invalid', items: { create: { title: 'Compra anterior', unitCents: 12000, totalCents: 12000 } } } },
    } });
    tenantIds.push(tenant.id);
    const token = await app.get(JwtService).signAsync({ sub: `test-${run}`, email: 'theme-test@example.invalid', tenantId: tenant.id, membershipRole: 'OWNER' }, { expiresIn: '5m', secret: app.get(ConfigService).getOrThrow<string>('JWT_ACCESS_SECRET') });
    const headers = { authorization: `Bearer ${token}` };
    const request = (method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: object) => app.inject({ method, url, headers, payload });
    return { tenantId: tenant.id, slug, request };
  }

  it('keeps theme management authenticated, rejects client tenant ids and invalid releases before writing', async () => {
    expect((await app.inject({ method: 'GET', url: '/store/themes' })).statusCode).toBe(401);
    const store = await fixture();
    const view = (await store.request('GET', '/store/editor')).json<StoreEditorView>();
    const base = { template: 'classic', version: '1.1.0', savedAt: view.savedAt };
    expect((await store.request('POST', '/store/themes/draft', { ...base, tenantId: 'other' })).statusCode).toBe(400);
    expect((await store.request('POST', '/store/themes/draft', { ...base, version: '9.0.0' })).statusCode).toBe(400);
    expect((await store.request('POST', '/store/themes/draft', { ...base, template: 'stride' })).statusCode).toBe(400);
    expect((await prisma.storefront.findUniqueOrThrow({ where: { tenantId: store.tenantId } })).themeDraftTemplate).toBeNull();
  });

  it.each([['classic', 'general'], ['selecta', 'belleza'], ['stride', 'moda']])('updates %s through draft, preview, publish and restores identity without losing merchant data', async (template, industry) => {
    const store = await fixture(industry, template);
    const products = await prisma.product.findMany({ where: { tenantId: store.tenantId } });
    const orders = await prisma.order.findMany({ where: { tenantId: store.tenantId }, include: { items: true } });
    const before = await prisma.storefront.findUniqueOrThrow({ where: { tenantId: store.tenantId } });
    const view = (await store.request('GET', '/store/editor')).json<StoreEditorView>();
    expect(view.themeVersion).toBe('1.0.0');
    const staged = await store.request('POST', '/store/themes/draft', { template, version: '1.1.0', savedAt: view.savedAt, preset: 'original' });
    expect(staged.statusCode).toBe(201);
    expect(staged.json().hasUnpublishedChanges).toBe(true);
    const active = (await app.inject({ method: 'GET', url: `/storefront/${store.slug}` })).json();
    expect(active.themeRelease.version).toBe('1.0.0');
    const frame = (await editor.get(store.tenantId)).frameUrl;
    const preview = new URL(frame).searchParams.get('editor')!;
    const previewStore = (await app.inject({ method: 'GET', url: `/storefront/${store.slug}`, headers: { 'x-store-preview': preview } })).json();
    expect(previewStore.themeRelease.version).toBe('1.1.0');
    expect(previewStore.templateContent.sections.hero).toMatchObject({ title: 'Mi portada', text: '' });
    expect(previewStore.templateContent.theme.primary).toBe('#102030');
    expect((await store.request('PATCH', '/store', { template, tagline: 'Mi descripción' })).json().themeStatus.editing.version).toBe('1.1.0');
    expect((await store.request('POST', '/store/editor/publish', {})).statusCode).toBe(201);
    const live = (await app.inject({ method: 'GET', url: `/storefront/${store.slug}` })).json();
    expect(live.themeRelease.version).toBe('1.1.0');
    const versions = await editor.versions(store.tenantId);
    expect(versions[0]).toMatchObject({ template, themeVersion: '1.0.0' });
    await editor.restore(store.tenantId, versions[0].id);
    expect((await editor.get(store.tenantId)).themeVersion).toBe('1.0.0');
    await editor.publish(store.tenantId);
    const restored = await prisma.storefront.findUniqueOrThrow({ where: { tenantId: store.tenantId } });
    expect(restored.templateContent).toEqual(before.templateContent);
    expect(restored.themeVersion).toBe('1.0.0');
    expect(restored).toMatchObject({ brandColor: before.brandColor, accentColor: before.accentColor, seoTitle: before.seoTitle, pickupAddress: before.pickupAddress });
    expect(await prisma.product.findMany({ where: { tenantId: store.tenantId } })).toEqual(products);
    expect(await prisma.order.findMany({ where: { tenantId: store.tenantId }, include: { items: true } })).toEqual(orders);
  });

  it('stages a switch from the existing settings API, preserves content and discards to the active theme', async () => {
    const store = await fixture('moda');
    const response = await store.request('PATCH', '/store', { template: 'stride' });
    expect(response.statusCode).toBe(200);
    expect(response.json().storefront.template).toBe('classic');
    expect((await editor.get(store.tenantId)).template).toBe('stride');
    const raw = await prisma.storefront.findUniqueOrThrow({ where: { tenantId: store.tenantId } });
    expect(raw.templateDraft).toBeNull(); // Selection alone is a meaningful draft.
    const discarded = await editor.discard(store.tenantId);
    expect(discarded).toMatchObject({ template: 'classic', themeVersion: '1.0.0', hasUnpublishedChanges: false });
    expect((await prisma.storefront.findUniqueOrThrow({ where: { tenantId: store.tenantId } })).templateContent).toEqual(raw.templateContent);
  });

  it('rejects stale autosave and future content schemas without changing the stored draft', async () => {
    const store = await fixture();
    const view = await editor.get(store.tenantId);
    const saved = await editor.saveDraft(store.tenantId, { version: 1, sections: { hero: { title: 'Primera sesión' } } }, view.savedAt);
    const stale = await store.request('PUT', '/store/editor/draft', { savedAt: view.savedAt, content: { version: 1, sections: { hero: { title: 'Sesión obsoleta' } } } });
    expect(stale.statusCode).toBe(409);
    const future = await store.request('PUT', '/store/editor/draft', { savedAt: saved.savedAt, content: { version: 2, sections: {} } });
    expect(future.statusCode).toBe(400);
    expect((await editor.get(store.tenantId)).content.sections.hero.title).toBe('Primera sesión');
    expect((await store.request('POST', '/store/editor/publish', { savedAt: view.savedAt })).statusCode).toBe(409);
    expect((await store.request('POST', '/store/editor/discard', { savedAt: view.savedAt })).statusCode).toBe(409);
    expect((await store.request('PUT', '/store/editor/schedule', { savedAt: view.savedAt, publishAt: new Date(Date.now() + 600_000).toISOString() })).statusCode).toBe(409);
  });

  it('registers, creates and configures a store, imports a preset, saves, previews, publishes and updates through HTTP', async () => {
    const registered = await app.inject({ method: 'POST', url: '/auth/register', payload: {
      email: `theme-registration-${run}@example.test`, password: 'ThemeTestPass2026!', fullName: 'Dueño de prueba', businessName: `Theme registered ${run}`, acceptTerms: true,
    } });
    expect(registered.statusCode).toBe(201);
    const auth = registered.json();
    tenantIds.push(auth.tenantId); userIds.push(auth.user.id);
    const request = (method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: object) => app.inject({ method, url, headers: { authorization: `Bearer ${auth.accessToken}` }, payload });
    // Commercial entitlement is a test fixture, not a theme side effect.
    await prisma.tenant.update({ where: { id: auth.tenantId }, data: { planTier: 'SCALE', planTrial: false, planExpiresAt: new Date(Date.now() + 86_400_000) } });
    expect((await request('POST', '/integrations/store/enable', {})).statusCode).toBe(200);
    expect((await request('GET', '/store')).statusCode).toBe(200);
    expect((await request('POST', '/catalog/products', { handle: 'merchant-product', name: 'Producto real', basePriceCents: 12000, stockQty: 8, isPublishedOnStore: true })).statusCode).toBe(201);
    expect((await request('PATCH', '/store', { displayName: 'Tienda de prueba', industry: 'moda', template: 'stride', whatsappPhone: '51900000000', contactEmail: 'merchant@example.test', sellerType: 'INDIVIDUAL', legalName: 'Comercio de prueba', dni: '00000000', legalAddress: 'Dirección de prueba', legalDistrict: 'Lima', complaintsBookUrl: 'https://example.test/reclamos' })).statusCode).toBe(200);
    await prisma.storefront.update({ where: { tenantId: auth.tenantId }, data: { pickupEnabled: true, pickupAddress: 'Dirección de prueba' } });
    const view = (await request('GET', '/store/editor')).json<StoreEditorView>();
    const staged = await request('POST', '/store/themes/draft', { template: 'stride', version: '1.1.0', preset: 'original', savedAt: view.savedAt });
    expect(staged.statusCode).toBe(201);
    const content = { ...staged.json().content, theme: { primary: '#234567', font: 'editorial', corners: 'round', container: 'compact' }, sections: { ...staged.json().content.sections, hero: { title: 'Mi comercio' }, navigation: { label1: 'Mis productos', destination1: '/productos' } } };
    const saved = await request('PUT', '/store/editor/draft', { savedAt: staged.json().savedAt, content });
    expect(saved.statusCode).toBe(200);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: auth.tenantId } });
    const previewToken = new URL(view.frameUrl).searchParams.get('editor')!;
    const preview = await app.inject({ method: 'GET', url: `/storefront/${tenant.slug}`, headers: { 'x-store-preview': previewToken } });
    expect(preview.json().templateContent.theme.primary).toBe('#234567');
    const published = await request('POST', '/store/publish', {});
    if (published.statusCode !== 201) throw new Error(published.json().message);
    const publicStore = (await app.inject({ method: 'GET', url: `/storefront/${tenant.slug}` })).json();
    expect(publicStore.themeRelease).toMatchObject({ slug: 'stride', version: '1.1.0', safeMode: false });
    expect(publicStore.templateContent.sections.hero.title).toBe('Mi comercio');
    expect((await app.inject({ method: 'GET', url: `/storefront/${tenant.slug}/products` })).json().items).toHaveLength(1);
    const current = await editor.get(auth.tenantId);
    expect((await request('POST', '/store/themes/draft', { template: 'classic', version: '1.0.0', savedAt: current.savedAt })).statusCode).toBe(201);
    await editor.publish(auth.tenantId);
    const classic = await editor.get(auth.tenantId);
    expect((await request('POST', '/store/themes/draft', { template: 'classic', version: '1.1.0', savedAt: classic.savedAt })).statusCode).toBe(201);
    await editor.publish(auth.tenantId);
    expect((await editor.get(auth.tenantId)).content.theme?.primary).toBe('#234567');
    expect(await prisma.product.count({ where: { tenantId: auth.tenantId } })).toBe(1);
  });

  it('never restores another tenant snapshot or accepts their preview and image assets', async () => {
    const first = await fixture(); const second = await fixture();
    await editor.stageTheme(first.tenantId, 'classic', '1.1.0');
    await editor.publish(first.tenantId);
    const versions = await editor.versions(first.tenantId);
    expect((await second.request('POST', `/store/editor/versions/${versions[0].id}/restore`, {})).statusCode).toBe(404);
    const preview = new URL((await editor.get(first.tenantId)).frameUrl).searchParams.get('editor')!;
    const foreign = await app.inject({ method: 'GET', url: `/storefront/${second.slug}`, headers: { 'x-store-preview': preview } });
    expect(foreign.json().isPreview).toBe(false);
    const saved = await editor.saveDraft(second.tenantId, { version: 1, sections: { hero: { image: 'https://evil.example/image.webp' } }, theme: { favicon: 'https://evil.example/favicon.svg' } });
    expect(saved.content.sections.hero?.image).toBeUndefined();
    expect(saved.content.theme?.favicon).toBeUndefined();
  });

  it('publishes scheduled selections once and stores a recoverable snapshot', async () => {
    const store = await fixture('moda');
    await editor.stageTheme(store.tenantId, 'stride', '1.1.0');
    const date = new Date(Date.now() + 10 * 60_000);
    await editor.schedule(store.tenantId, date);
    expect(await editor.publishScheduled(new Date(date.getTime() + 1000))).toBe(1);
    expect(await editor.publishScheduled(new Date(date.getTime() + 2000))).toBe(0);
    expect((await prisma.storefront.findUniqueOrThrow({ where: { tenantId: store.tenantId } })).template).toBe('stride');
    expect(await editor.versions(store.tenantId)).toHaveLength(1);
  });

  it('uses recovery presentation for an unavailable release while preserving identity and merchant data', async () => {
    const store = await fixture('belleza', 'selecta');
    const before = await prisma.storefront.update({ where: { tenantId: store.tenantId }, data: { themeVersion: '9.0.0' } });
    const publicStore = (await app.inject({ method: 'GET', url: `/storefront/${store.slug}` })).json();
    expect(publicStore.themeRelease).toMatchObject({ slug: 'selecta', version: '9.0.0', renderer: 'classic', safeMode: true });
    expect(publicStore.templateContent).toEqual(before.templateContent);
    await editor.stageTheme(store.tenantId, 'classic', '1.1.0');
    await editor.publish(store.tenantId);
    expect((await prisma.storefront.findUniqueOrThrow({ where: { tenantId: store.tenantId } })).templateContent).toEqual(before.templateContent);
  });

  it('does not invent a theme identity when restoring legacy snapshots', async () => {
    const store = await fixture('moda', 'stride');
    const version = await prisma.storefrontVersion.create({ data: { tenantId: store.tenantId, content: { version: 1, sections: { hero: { title: 'Texto anterior' } } } } });
    const restored = await editor.restore(store.tenantId, version.id);
    expect(restored).toMatchObject({ template: 'stride', themeVersion: '1.0.0' });
    expect(restored.content.sections.hero.title).toBe('Texto anterior');
  });
});
