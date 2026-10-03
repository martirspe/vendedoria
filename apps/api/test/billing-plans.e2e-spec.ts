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
import { currentPeriodStart } from '../src/billing/plan-catalog';
import { CouponsService } from '../src/coupons/coupons.service';
import { PlanLimitsService } from '../src/billing/plan-limits.service';
import type { AuthUserPayload } from '../src/common/types/auth-user';
import { PrismaService } from '../src/prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Flow A: paid plans and chat packs are only granted by a confirmed payment of the same
 * tenant, exactly once. Runs without platform Mercado Pago credentials, so checkouts use the
 * simulator.
 */
describe('Plan billing (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let billing: BillingService;
  let limits: PlanLimitsService;
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
    limits = app.get(PlanLimitsService);

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

  it('starts every business on a 14-day Crece trial with the trial limits', async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(tenant).toMatchObject({ planTier: 'GROW', planTrial: true });
    const expected = Date.now() + 14 * DAY_MS;
    expect(Math.abs((tenant.planExpiresAt?.getTime() ?? 0) - expected)).toBeLessThan(60_000);

    const usage = await limits.getUsage(owner.tenantId);
    expect(usage).toMatchObject({
      planStatus: 'TRIAL',
      conversationQuota: 100,
      aiReplyQuota: 1_500,
      productQuota: 20,
      seatQuota: 2,
    });
  });

  it('never switches to a paid plan or adds chats without a payment', async () => {
    await expect(billing.createCheckout(owner, { planTier: 'ENTERPRISE' })).rejects.toThrow(BadRequestException);
    await expect(billing.createCheckout(owner, { planTier: 'GROW', months: 2 })).rejects.toThrow(BadRequestException);
    await expect(billing.createCheckout(agent, { planTier: 'GROW' })).rejects.toThrow(ForbiddenException);
    await expect(billing.createCheckout(owner, { chatPackSize: 100 })).rejects.toThrow(BadRequestException);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(tenant.planTrial).toBe(true);
  });

  it('activates the plan once, only for the paying tenant', async () => {
    const checkout = await billing.createCheckout(owner, { planTier: 'GROW' });
    expect(checkout.simulated).toBe(true);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } });
    expect(payment).toMatchObject({
      flow: 'BILLING_SUBSCRIPTION',
      planTier: 'GROW',
      planMonths: 1,
      amountCents: 7_900,
      status: 'PENDING',
    });
    expect((await billing.createCheckout(owner, { planTier: 'GROW' })).paymentId).toBe(checkout.paymentId);

    await expect(billing.simulatePayment(otherOwner, checkout.paymentId)).rejects.toThrow(
      NotFoundException,
    );

    const trial = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    await expect(billing.simulatePayment(owner, checkout.paymentId)).resolves.toEqual({ status: 'active' });
    const first = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(first).toMatchObject({ planTier: 'GROW', planTrial: false });
    // Paying Crece during its trial keeps the remaining trial days.
    expect(first.planExpiresAt?.getTime()).toBe((trial.planExpiresAt?.getTime() ?? 0) + 30 * DAY_MS);
    expect(await limits.getUsage(owner.tenantId)).toMatchObject({
      planStatus: 'ACTIVE',
      conversationQuota: 400,
      aiReplyQuota: 6_000,
      productQuota: 100,
      couponQuota: 5,
      seatQuota: 2,
    });

    await expect(billing.simulatePayment(owner, checkout.paymentId)).resolves.toEqual({ status: 'active' });
    const again = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(again.planExpiresAt).toEqual(first.planExpiresAt);

    const other = await prisma.tenant.findUniqueOrThrow({ where: { id: otherOwner.tenantId } });
    expect(other.planTrial).toBe(true);
  });

  it('charges a prepaid period with its discount and adds all its days', async () => {
    const before = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    const renewal = await billing.createCheckout(owner, { planTier: 'GROW', months: 3 });
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: renewal.paymentId } });
    expect(payment).toMatchObject({ planMonths: 3, amountCents: 22_500 });
    await billing.simulatePayment(owner, renewal.paymentId);
    const after = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(after.planExpiresAt?.getTime()).toBe((before.planExpiresAt?.getTime() ?? 0) + 90 * DAY_MS);
  });

  it('adds paid chat packs to this month only, with their AI replies', async () => {
    const checkout = await billing.createCheckout(owner, { chatPackSize: 100 });
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } });
    expect(payment).toMatchObject({ planTier: null, chatPackSize: 100, amountCents: 1_500 });
    await billing.simulatePayment(owner, checkout.paymentId);
    await billing.simulatePayment(owner, checkout.paymentId);
    expect(await limits.getUsage(owner.tenantId)).toMatchObject({
      extraChats: 100,
      conversationQuota: 500,
      aiReplyQuota: 7_500,
    });
  });

  it('stops using AI once the month cap is reached', async () => {
    await prisma.aiUsageMonth.upsert({
      where: { tenantId_periodStart: { tenantId: owner.tenantId, periodStart: currentPeriodStart() } },
      create: { tenantId: owner.tenantId, periodStart: currentPeriodStart(), replies: 7_499 },
      update: { replies: 7_499 },
    });
    expect(await limits.canUseAi(owner.tenantId)).toBe(true);
    await limits.recordAiReply(owner.tenantId);
    expect(await limits.canUseAi(owner.tenantId)).toBe(false);
  });

  it('caps active coupons by plan, counting reactivations', async () => {
    const coupons = app.get(CouponsService);
    const coupon = (code: string, isActive = true) =>
      coupons.create(owner.tenantId, { code, label: code, kind: 'PERCENT', value: 10, isActive });
    for (const code of ['UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO']) await coupon(`${code}${run}`);
    await expect(coupon(`SEIS${run}`)).rejects.toThrow(ForbiddenException);
    const paused = await coupon(`PAUSA${run}`, false);
    await expect(coupons.update(owner.tenantId, paused.id, { isActive: true })).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      coupons.update(owner.tenantId, paused.id, { label: 'Sigue pausado' }),
    ).resolves.toMatchObject({ isActive: false });
  });

  it('blocks new conversations, products and chat packs once the period ends', async () => {
    await prisma.tenant.update({
      where: { id: owner.tenantId },
      data: { planExpiresAt: new Date(Date.now() - 1000) },
    });
    const usage = await limits.getUsage(owner.tenantId);
    expect(usage).toMatchObject({ planStatus: 'EXPIRED', conversationQuota: 0, productQuota: 0, integrations: [] });
    await expect(limits.assertCanCreateProduct(owner.tenantId)).rejects.toThrow(ForbiddenException);
    await expect(limits.assertCanStartConversation(owner.tenantId)).rejects.toThrow(ForbiddenException);
    await expect(billing.createCheckout(owner, { chatPackSize: 100 })).rejects.toThrow(BadRequestException);
    expect((await billing.getOverview(owner.tenantId)).planStatus).toBe('EXPIRED');
  });

  it('ends an expired trial with the first payment', async () => {
    await prisma.tenant.update({
      where: { id: otherOwner.tenantId },
      data: { planExpiresAt: new Date(Date.now() - 1000) },
    });
    const checkout = await billing.createCheckout(otherOwner, { planTier: 'SCALE' });
    await billing.simulatePayment(otherOwner, checkout.paymentId);
    const usage = await limits.getUsage(otherOwner.tenantId);
    expect(usage).toMatchObject({ planTier: 'SCALE', planStatus: 'ACTIVE', productQuota: 300 });
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
