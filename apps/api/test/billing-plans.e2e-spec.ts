import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { BillingService } from '../src/billing/billing.service';
import { PlanLimitsService } from '../src/billing/plan-limits.service';
import type { AuthUserPayload } from '../src/common/types/auth-user';
import { PrismaService } from '../src/prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Flow A: paid plans are only granted by a confirmed payment of the same tenant, exactly once.
 * Runs without platform Mercado Pago credentials, so checkouts use the simulator.
 */
describe('Plan billing (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let billing: BillingService;
  const run = randomBytes(3).toString('hex');
  const tenantIds: string[] = [];
  let owner: AuthUserPayload;
  let agent: AuthUserPayload;
  let otherOwner: AuthUserPayload;

  const user = (tenantId: string, membershipRole: string): AuthUserPayload => ({
    userId: `user-${run}`,
    email: `billing-${run}@example.test`,
    tenantId,
    membershipRole,
  });

  beforeAll(async () => {
    delete process.env.PLATFORM_MERCADOPAGO_ACCESS_TOKEN;
    delete process.env.PLATFORM_MERCADOPAGO_WEBHOOK_SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
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
    billing = app.get(BillingService);

    const a = await prisma.tenant.create({ data: { name: 'Plan A', slug: `plan-a-${run}` } });
    const b = await prisma.tenant.create({ data: { name: 'Plan B', slug: `plan-b-${run}` } });
    tenantIds.push(a.id, b.id);
    owner = user(a.id, 'OWNER');
    agent = user(a.id, 'AGENT');
    otherOwner = user(b.id, 'OWNER');
  });

  afterAll(async () => {
    if (prisma && tenantIds.length) {
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
    await app?.close();
  });

  it('never switches to a paid plan without a payment', async () => {
    await expect(billing.updatePlan(owner, 'BUSINESS')).rejects.toThrow(BadRequestException);
    await expect(billing.createCheckout(owner, 'BUSINESS')).rejects.toThrow(BadRequestException);
    await expect(billing.createCheckout(agent, 'STARTER')).rejects.toThrow(ForbiddenException);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(tenant.planTier).toBe('FREE');
  });

  it('activates the plan once, only for the paying tenant', async () => {
    const checkout = await billing.createCheckout(owner, 'STARTER');
    expect(checkout.simulated).toBe(true);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } });
    expect(payment).toMatchObject({
      flow: 'BILLING_SUBSCRIPTION',
      planTier: 'STARTER',
      amountCents: 7_900,
      status: 'PENDING',
    });
    expect((await billing.createCheckout(owner, 'STARTER')).paymentId).toBe(checkout.paymentId);

    await expect(billing.simulatePayment(otherOwner, checkout.paymentId)).rejects.toThrow(
      NotFoundException,
    );

    await expect(billing.simulatePayment(owner, checkout.paymentId)).resolves.toEqual({ status: 'active' });
    const first = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(first.planTier).toBe('STARTER');
    const expected = Date.now() + 30 * DAY_MS;
    expect(Math.abs((first.planExpiresAt?.getTime() ?? 0) - expected)).toBeLessThan(60_000);

    await expect(billing.simulatePayment(owner, checkout.paymentId)).resolves.toEqual({ status: 'active' });
    const again = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(again.planExpiresAt).toEqual(first.planExpiresAt);

    const other = await prisma.tenant.findUniqueOrThrow({ where: { id: otherOwner.tenantId } });
    expect(other.planTier).toBe('FREE');
  });

  it('adds the days when the same plan is renewed', async () => {
    const before = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    const renewal = await billing.createCheckout(owner, 'STARTER');
    await billing.simulatePayment(owner, renewal.paymentId);
    const after = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(after.planExpiresAt?.getTime()).toBe((before.planExpiresAt?.getTime() ?? 0) + 30 * DAY_MS);
  });

  it('applies FREE limits once the paid period ends', async () => {
    await prisma.tenant.update({
      where: { id: owner.tenantId },
      data: { planExpiresAt: new Date(Date.now() - 1000) },
    });
    const usage = await app.get(PlanLimitsService).getUsage(owner.tenantId);
    expect(usage.planTier).toBe('FREE');
    expect(usage.productQuota).toBe(20);
    expect((await billing.getOverview(owner.tenantId)).currentPlan.id).toBe('FREE');
  });

  it('rejects plan webhooks without a valid platform signature', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/billing/mercadopago?type=payment&data.id=123',
      payload: { type: 'payment', data: { id: '123' } },
    });
    expect(response.statusCode).toBe(401);
  });
});
