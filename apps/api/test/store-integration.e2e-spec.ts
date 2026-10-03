import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { AppModule } from '../src/app.module';
import type { AuthUserPayload } from '../src/common/types/auth-user';
import { IntegrationsService } from '../src/integrations/integrations.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorefrontService } from '../src/storefront/storefront.service';

/** The web store is an add-on: it only exists publicly while the business keeps it on. */
describe('Store integration (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let integrations: IntegrationsService;
  const run = randomBytes(3).toString('hex');
  const slug = `addon-${run}`;
  const email = `owner-addon-${run}@example.test`;
  let owner: AuthUserPayload;

  const get = (url: string) => app.inject({ method: 'GET', url });
  const stateOf = async (key: string) =>
    (await integrations.list(owner.tenantId)).find((state) => state.key === key);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    integrations = app.get(IntegrationsService);

    const tenant = await prisma.tenant.create({
      data: {
        name: slug,
        slug,
        planTier: 'SCALE',
        planTrial: false,
        planExpiresAt: new Date(Date.now() + 30 * 86_400_000),
        storefront: { create: { displayName: `Tienda ${slug}`, status: 'PUBLISHED', whatsappPhone: '51900000000' } },
      },
    });
    const user = await prisma.user.create({ data: { email, passwordHash: 'x', fullName: 'Dueño' } });
    await prisma.membership.create({ data: { userId: user.id, tenantId: tenant.id, role: 'OWNER' } });
    owner = { userId: user.id, email, tenantId: tenant.id, membershipRole: 'OWNER' };
  });

  afterAll(async () => {
    if (prisma && owner) {
      await prisma.tenant.deleteMany({ where: { id: owner.tenantId } });
      await prisma.user.deleteMany({ where: { email } });
    }
    await app?.close();
  });

  it('keeps a store off until the business turns it on', async () => {
    expect((await integrations.list(owner.tenantId)).find((state) => state.key === 'store')).toMatchObject({
      enabled: false,
      included: true,
      requiredPlan: { id: 'GROW', name: 'Crece' },
    });
    expect((await get(`/storefront/resolve?host=${slug}.localhost:4300`)).statusCode).toBe(404);
    expect((await get(`/storefront/${slug}`)).statusCode).toBe(404);
    expect((await get(`/storefront/${slug}/products`)).statusCode).toBe(404);
    await expect(app.get(StorefrontService).publish(owner.tenantId)).rejects.toThrow(ForbiddenException);
  });

  it('needs the store before the add-ons that run on it', async () => {
    await expect(integrations.enable(owner, 'tracking')).rejects.toThrow(BadRequestException);
  });

  it('serves the store once it is on', async () => {
    await integrations.enable(owner, 'store');
    expect((await get(`/storefront/resolve?host=${slug}.localhost:4300`)).statusCode).toBe(200);
    expect((await get(`/storefront/${slug}`)).statusCode).toBe(200);
  });

  it('pauses the add-ons on the store while it is off and resumes them with their settings', async () => {
    await integrations.enable(owner, 'tracking');
    await integrations.updateTracking(owner, { metaPixelId: '123456789012345' });
    await integrations.enable(owner, 'instagram');

    await integrations.disable(owner, 'store');
    expect((await get(`/storefront/${slug}`)).statusCode).toBe(404);
    expect(await stateOf('tracking')).toMatchObject({ enabled: true, active: false });
    expect(await stateOf('instagram')).toMatchObject({ enabled: true, active: true });
    expect(await integrations.getTracking(owner.tenantId)).toMatchObject({ active: false, metaPixelId: '123456789012345' });

    await integrations.enable(owner, 'store');
    expect(await stateOf('tracking')).toMatchObject({ enabled: true, active: true });
    expect(await integrations.getTracking(owner.tenantId)).toMatchObject({ active: true, metaPixelId: '123456789012345' });
  });

  it('closes the store on Inicia and once the plan expires, and reopens it on Crece', async () => {
    const setPlan = (data: { planTier: 'START' | 'GROW'; planExpiresAt: Date }) =>
      prisma.tenant.update({ where: { id: owner.tenantId }, data: { ...data, planTrial: false } });
    const inAMonth = new Date(Date.now() + 30 * 86_400_000);

    await setPlan({ planTier: 'START', planExpiresAt: inAMonth });
    expect(await stateOf('store')).toMatchObject({ enabled: true, included: false, active: false });
    expect((await get(`/storefront/${slug}`)).statusCode).toBe(404);
    await integrations.disable(owner, 'store');
    await expect(integrations.enable(owner, 'store')).rejects.toThrow(ForbiddenException);

    await setPlan({ planTier: 'GROW', planExpiresAt: inAMonth });
    await integrations.enable(owner, 'store');
    expect((await get(`/storefront/${slug}`)).statusCode).toBe(200);

    await setPlan({ planTier: 'GROW', planExpiresAt: new Date(Date.now() - 1000) });
    expect((await get(`/storefront/resolve?host=${slug}.localhost:4300`)).statusCode).toBe(404);
  });
});
