import { BadRequestException, ConflictException, ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorefrontService } from '../src/storefront/storefront.service';

describe('Store subdomain change (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let storefront: StorefrontService;
  const run = randomBytes(3).toString('hex');
  const slugA = `sub-a-${run}`;
  const slugB = `sub-b-${run}`;
  const tenantIds: string[] = [];
  let tenantAId = '';

  const resolve = (slug: string) =>
    app.inject({ method: 'GET', url: `/storefront/resolve?host=${slug}.localhost:4300` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    storefront = app.get(StorefrontService);

    for (const slug of [slugA, slugB]) {
      const tenant = await prisma.tenant.create({
        data: {
          name: slug,
          slug,
          storefront: { create: { displayName: `Tienda ${slug}`, status: 'PUBLISHED', whatsappPhone: '51900000000' } },
          integrations: { create: { key: 'store' } },
        },
      });
      tenantIds.push(tenant.id);
    }
    tenantAId = tenantIds[0];
  });

  afterAll(async () => {
    if (prisma && tenantIds.length) {
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
    await app?.close();
  });

  it('moves the store and keeps the former subdomain pointing to it', async () => {
    const next = `${slugA}-nuevo`;
    const view = await storefront.changeSubdomain(tenantAId, next);
    expect(view.url).toContain(`//${next}.`);

    expect((await resolve(next)).json()).toEqual({ slug: next, moved: false, primaryHost: null });
    expect((await resolve(slugA)).json()).toEqual({ slug: next, moved: true, primaryHost: null });

    const store = await app.inject({ method: 'GET', url: `/storefront/${slugA}` });
    expect(store.statusCode).toBe(200);
    expect(store.json().slug).toBe(next);
  });

  it('never hands a subdomain in use, current or former, to another store', async () => {
    const tenantBId = tenantIds[1];
    await expect(storefront.changeSubdomain(tenantBId, `${slugA}-nuevo`)).rejects.toBeInstanceOf(ConflictException);
    await expect(storefront.changeSubdomain(tenantBId, slugA)).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets a store take back one of its own former subdomains', async () => {
    await storefront.changeSubdomain(tenantAId, slugA);
    expect((await resolve(slugA)).json()).toEqual({ slug: slugA, moved: false, primaryHost: null });
    expect((await resolve(`${slugA}-nuevo`)).json()).toEqual({ slug: slugA, moved: true, primaryHost: null });
  });

  it('rejects reserved names and limits the changes per month', async () => {
    await expect(storefront.changeSubdomain(tenantAId, 'www')).rejects.toBeInstanceOf(BadRequestException);
    // Former subdomains kept so far: `-nuevo` and the original; two more changes reach the cap of 3.
    await storefront.changeSubdomain(tenantAId, `${slugA}-tres`);
    await storefront.changeSubdomain(tenantAId, `${slugA}-cuatro`);
    await expect(storefront.changeSubdomain(tenantAId, `${slugA}-cinco`)).rejects.toBeInstanceOf(BadRequestException);
  });
});
