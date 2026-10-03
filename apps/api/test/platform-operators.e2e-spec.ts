import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { applyOperatorChange } from '../src/platform/platform-operators';
import { PrismaService } from '../src/prisma/prisma.service';

type Session = {
  accessToken: string;
  refreshToken: string;
  user: { platformRole?: string; permissions?: string[] };
};

/** Platform and business sessions never cross, and platform access follows the database role at once. */
describe('Platform operators (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  const run = randomBytes(3).toString('hex');
  const password = `Operador${run}2026`;
  const superEmail = `super-${run}@example.test`;
  const adminEmail = `admin-${run}@example.test`;
  const ownerEmail = `owner-${run}@example.test`;
  let tenantId: string;

  const post = (url: string, payload: object) =>
    app.inject({ method: 'POST', url, payload });
  const get = (url: string, token: string) =>
    app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
  const session = async (url: string, payload: object) =>
    (await post(url, payload)).json<Session>();
  const platformLogin = (email: string) =>
    session('/platform/auth/login', { email, password });

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
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);

    const tenant = await prisma.tenant.create({
      data: { name: 'Ops test', slug: `ops-${run}` },
    });
    tenantId = tenant.id;
    const owner = await prisma.user.create({
      data: {
        email: ownerEmail,
        passwordHash: await bcrypt.hash(password, 4),
        fullName: 'Dueña',
      },
    });
    await prisma.membership.create({
      data: { userId: owner.id, tenantId, role: 'OWNER' },
    });
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.user.findMany({
        where: { email: { in: [superEmail, adminEmail, ownerEmail] } },
        select: { id: true },
      });
      const ids = users.map((user) => user.id);
      await prisma.platformAuditLog.deleteMany({
        where: { targetUserId: { in: ids } },
      });
      await prisma.platformAuditLog.deleteMany({
        where: { actorUserId: { in: ids } },
      });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });

  it('creates operators only through the CLI service and audits it', async () => {
    const created = await applyOperatorChange(prisma, {
      kind: 'grant',
      email: superEmail,
      role: 'SUPERADMIN',
      fullName: 'Super',
      password,
    });
    expect(created.actions).toEqual(['operator.created']);
    await applyOperatorChange(prisma, {
      kind: 'grant',
      email: adminEmail,
      role: 'ADMIN',
      password,
    });
    await expect(
      applyOperatorChange(prisma, {
        kind: 'grant',
        email: `weak-${run}@example.test`,
        role: 'ADMIN',
        password: 'corta1',
      }),
    ).rejects.toThrow();
    expect(
      await prisma.platformAuditLog.count({
        where: { targetUserId: created.userId, action: 'operator.created' },
      }),
    ).toBe(1);
  });

  it('keeps platform and business sessions apart', async () => {
    const operator = await platformLogin(superEmail);
    expect(operator.user.platformRole).toBe('SUPERADMIN');
    expect((await get('/platform/me', operator.accessToken)).statusCode).toBe(
      200,
    );
    expect((await get('/tenants/me', operator.accessToken)).statusCode).toBe(
      401,
    );
    expect(
      (await post('/auth/refresh', { refreshToken: operator.refreshToken }))
        .statusCode,
    ).toBe(401);

    const business = await session('/auth/login', {
      email: ownerEmail,
      password,
    });
    expect((await get('/tenants/me', business.accessToken)).statusCode).toBe(
      200,
    );
    expect((await get('/platform/me', business.accessToken)).statusCode).toBe(
      401,
    );
    expect(
      (
        await post('/platform/auth/refresh', {
          refreshToken: business.refreshToken,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await post('/platform/auth/login', { email: ownerEmail, password }))
        .statusCode,
    ).toBe(401);

    const refreshed = await session('/platform/auth/refresh', {
      refreshToken: operator.refreshToken,
    });
    expect((await get('/platform/me', refreshed.accessToken)).statusCode).toBe(
      200,
    );
  });

  it('cuts platform access as soon as the role is revoked', async () => {
    const admin = await platformLogin(adminEmail);
    expect(admin.user.permissions).toContain('support.assist');
    expect(admin.user.permissions).not.toContain('operators.manage');
    expect((await get('/platform/me', admin.accessToken)).statusCode).toBe(200);

    await applyOperatorChange(prisma, { kind: 'revoke', email: adminEmail });
    expect((await get('/platform/me', admin.accessToken)).statusCode).toBe(401);
    expect(
      (
        await post('/platform/auth/refresh', {
          refreshToken: admin.refreshToken,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await post('/platform/auth/login', { email: adminEmail, password }))
        .statusCode,
    ).toBe(401);
  });

  it('never leaves the platform without a SUPERADMIN', async () => {
    const others = await prisma.user.count({
      where: { platformRole: 'SUPERADMIN', email: { not: superEmail } },
    });
    if (others > 0) return;
    await expect(
      applyOperatorChange(prisma, { kind: 'revoke', email: superEmail }),
    ).rejects.toThrow(/último SUPERADMIN/);
    await expect(
      applyOperatorChange(prisma, {
        kind: 'grant',
        email: superEmail,
        role: 'ADMIN',
      }),
    ).rejects.toThrow(/último SUPERADMIN/);
  });
});
