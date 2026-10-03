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
import { CouponsService } from '../src/coupons/coupons.service';
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

  it('starts every business on a 30-day Starter trial with the trial limits', async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(tenant).toMatchObject({ planTier: 'STARTER', planTrial: true });
    const expected = Date.now() + 30 * DAY_MS;
    expect(Math.abs((tenant.planExpiresAt?.getTime() ?? 0) - expected)).toBeLessThan(60_000);

    const usage = await app.get(PlanLimitsService).getUsage(owner.tenantId);
    expect(usage).toMatchObject({ planStatus: 'TRIAL', conversationQuota: 100, productQuota: 20 });
  });

  it('never switches to a paid plan without a payment', async () => {
    await expect(billing.createCheckout(owner, 'ENTERPRISE')).rejects.toThrow(BadRequestException);
    await expect(billing.createCheckout(agent, 'STARTER')).rejects.toThrow(ForbiddenException);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(tenant.planTrial).toBe(true);
  });

  it('activates the plan once, only for the paying tenant', async () => {
    const checkout = await billing.createCheckout(owner, 'STARTER');
    expect(checkout.simulated).toBe(true);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } });
    expect(payment).toMatchObject({
      flow: 'BILLING_SUBSCRIPTION',
      planTier: 'STARTER',
      amountCents: 6_900,
      status: 'PENDING',
    });
    expect((await billing.createCheckout(owner, 'STARTER')).paymentId).toBe(checkout.paymentId);

    await expect(billing.simulatePayment(otherOwner, checkout.paymentId)).rejects.toThrow(
      NotFoundException,
    );

    const trial = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    await expect(billing.simulatePayment(owner, checkout.paymentId)).resolves.toEqual({ status: 'active' });
    const first = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(first).toMatchObject({ planTier: 'STARTER', planTrial: false });
    // Paying Starter during the trial keeps the remaining trial days.
    expect(first.planExpiresAt?.getTime()).toBe((trial.planExpiresAt?.getTime() ?? 0) + 30 * DAY_MS);
    const usage = await app.get(PlanLimitsService).getUsage(owner.tenantId);
    expect(usage).toMatchObject({
      planStatus: 'ACTIVE',
      conversationQuota: 300,
      productQuota: 100,
      couponQuota: 3,
    });

    await expect(billing.simulatePayment(owner, checkout.paymentId)).resolves.toEqual({ status: 'active' });
    const again = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(again.planExpiresAt).toEqual(first.planExpiresAt);

    const other = await prisma.tenant.findUniqueOrThrow({ where: { id: otherOwner.tenantId } });
    expect(other.planTrial).toBe(true);
  });

  it('adds the days when the same plan is renewed', async () => {
    const before = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    const renewal = await billing.createCheckout(owner, 'STARTER');
    await billing.simulatePayment(owner, renewal.paymentId);
    const after = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(after.planExpiresAt?.getTime()).toBe((before.planExpiresAt?.getTime() ?? 0) + 30 * DAY_MS);
  });

  it('caps active coupons by plan, counting reactivations', async () => {
    const coupons = app.get(CouponsService);
    const coupon = (code: string, isActive = true) =>
      coupons.create(owner.tenantId, { code, label: code, kind: 'PERCENT', value: 10, isActive });
    for (const code of ['UNO', 'DOS', 'TRES']) await coupon(`${code}${run}`);
    await expect(coupon(`CUATRO${run}`)).rejects.toThrow(ForbiddenException);
    const paused = await coupon(`PAUSA${run}`, false);
    await expect(coupons.update(owner.tenantId, paused.id, { isActive: true })).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      coupons.update(owner.tenantId, paused.id, { label: 'Sigue pausado' }),
    ).resolves.toMatchObject({ isActive: false });
  });

  it('blocks new conversations and products once the period ends', async () => {
    await prisma.tenant.update({
      where: { id: owner.tenantId },
      data: { planExpiresAt: new Date(Date.now() - 1000) },
    });
    const limits = app.get(PlanLimitsService);
    const usage = await limits.getUsage(owner.tenantId);
    expect(usage).toMatchObject({ planStatus: 'EXPIRED', conversationQuota: 0, productQuota: 0 });
    await expect(limits.assertCanCreateProduct(owner.tenantId)).rejects.toThrow(ForbiddenException);
    await expect(limits.assertCanStartConversation(owner.tenantId)).rejects.toThrow(ForbiddenException);
    expect((await billing.getOverview(owner.tenantId)).planStatus).toBe('EXPIRED');
  });

  it('ends an expired trial with the first payment', async () => {
    await prisma.tenant.update({
      where: { id: otherOwner.tenantId },
      data: { planExpiresAt: new Date(Date.now() - 1000) },
    });
    const checkout = await billing.createCheckout(otherOwner, 'PRO');
    await billing.simulatePayment(otherOwner, checkout.paymentId);
    const usage = await app.get(PlanLimitsService).getUsage(otherOwner.tenantId);
    expect(usage).toMatchObject({ planTier: 'PRO', planStatus: 'ACTIVE', productQuota: 500 });
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
