import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/** Run with npm run test:docker, which migrates the isolated vendedoria_test database. */
describe('Conversion tenant isolation (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  const run = randomBytes(4).toString('hex');
  const slugA = `recovery-a-${run}`;
  const slugB = `recovery-b-${run}`;
  const tenants: string[] = [];
  let token = '';
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    // Queue clients remain disabled in NODE_ENV=test. Outbox capture needs only the configured flag.
    module.get(ConfigService).set('REDIS_URL', 'redis://localhost:6379/0');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    for (const [slug, suffix] of [
      [slugA, 'A'],
      [slugB, 'B'],
    ]) {
      const tenant = await prisma.tenant.create({
        data: {
          slug,
          name: `Fixture ${suffix}`,
          storefront: {
            create: { status: 'PUBLISHED', displayName: `Fixture ${suffix}` },
          },
          integrations: { create: { key: 'store' } },
          conversionSettings: { create: { recoveryEnabled: true } },
          products: {
            create: [
              {
                handle: 'shoe',
                name: `Shoe ${suffix}`,
                basePriceCents: 5000,
                categories: ['Shoes'],
                isPublishedOnStore: true,
              },
              {
                handle: 'care',
                name: `Care ${suffix}`,
                basePriceCents: 1000,
                categories: ['Shoes'],
                isPublishedOnStore: true,
              },
              {
                handle: 'private',
                name: `Private ${suffix}`,
                basePriceCents: 1000,
                categories: ['Shoes'],
                isPublishedOnStore: false,
              },
            ],
          },
        },
      });
      tenants.push(tenant.id);
    }
  });
  afterAll(async () => {
    if (prisma && tenants.length)
      await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
    await app?.close();
  });
  it('creates a consented durable sequence and does not accept tenantId in the body', async () => {
    const payload = {
      sessionId: randomUUID(),
      items: [{ handle: 'shoe', quantity: 2 }],
      email: 'fixture@example.test',
      emailConsent: true,
      whatsappConsent: false,
    };
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/v1/storefront/${slugA}/recovery`,
      payload: { ...payload, tenantId: tenants[1] },
    });
    expect(rejected.statusCode).toBe(400);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/storefront/${slugA}/recovery`,
      payload,
    });
    expect(response.statusCode).toBe(201);
    token = response.json<{ token: string }>().token;
    expect(
      await prisma.recoveryDelivery.count({
        where: { tenantId: tenants[0], status: 'PENDING' },
      }),
    ).toBe(3);
  });
  it('cannot restore or unsubscribe another tenant capability', async () => {
    for (const action of ['restore', 'revoke', 'activity']) {
      const result = await app.inject({
        method: 'POST',
        url: `/api/v1/storefront/${slugB}/recovery/${action}`,
        payload: {
          token,
          ...(action === 'activity'
            ? { items: [{ handle: 'shoe', quantity: 1 }] }
            : {}),
        },
      });
      expect(result.statusCode).toBe(404);
    }
  });
  it('restores authoritative prices and reduces quantities to current stock', async () => {
    await prisma.product.updateMany({
      where: { tenantId: tenants[0], handle: 'shoe' },
      data: { basePriceCents: 6500, stockUnlimited: false, stockQty: 1 },
    });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/storefront/${slugA}/recovery/restore`,
      payload: { token },
    });
    expect(response.statusCode).toBe(200);
    expect(
      response.json<{ lines: Array<{ name: string; unitCents: number }> }>()
        .lines[0],
    ).toMatchObject({ name: 'Shoe A', unitCents: 6500, quantity: 1 });
  });
  it('hydrates only current-tenant published recommendations', async () => {
    for (const [slug, suffix] of [
      [slugA, 'A'],
      [slugB, 'B'],
    ]) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/storefront/${slug}/recommendations?handles=shoe&context=cart`,
      });
      expect(response.statusCode).toBe(200);
      const items = response.json<{
        items: Array<{ product: { handle: string; name: string } }>;
      }>().items;
      expect(items.map((item) => item.product.name)).toEqual([
        `Care ${suffix}`,
      ]);
    }
  });
  it('removes contact data and pending sends immediately on revocation', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/storefront/${slugA}/recovery/revoke`,
      payload: { token },
    });
    expect(response.statusCode).toBe(200);
    const cart = await prisma.recoveryCart.findFirstOrThrow({
      where: { tenantId: tenants[0] },
    });
    expect(cart.email).toBeNull();
    expect(cart.phone).toBeNull();
    expect(cart.revokedAt).not.toBeNull();
    expect(
      await prisma.recoveryDelivery.count({
        where: { tenantId: tenants[0], status: 'PENDING' },
      }),
    ).toBe(0);
  });
});
