import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanTier, Prisma } from '@prisma/client';
import type { AuthUserPayload } from '../common/types/auth-user';
import type { MerchantCredentials } from '../payments/merchant-accounts.service';
import { MercadoPagoPaymentProvider } from '../payments/mercadopago.provider';
import type { NormalizedWebhookEvent } from '../payments/payment-provider.port';
import { PrismaService } from '../prisma/prisma.service';
import {
  effectivePlanTier,
  getPlanDefinition,
  isPurchasable,
  PLAN_CATALOG,
  PLAN_CURRENCY,
  PLAN_PERIOD_DAYS,
} from './plan-catalog';

const MANAGER_ROLES = ['OWNER', 'ADMIN'];
const DAY_MS = 24 * 60 * 60 * 1000;
/** A pending checkout is reused for the same plan instead of opening a new one. */
const CHECKOUT_REUSE_MS = 6 * 60 * 60 * 1000;

export type PlanPaymentResult = {
  status: 'active' | 'pending' | 'failed' | 'review';
};

/** Flow A: the tenant pays VendedorIA for its plan, on the platform's own Mercado Pago account. */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mercadoPago: MercadoPagoPaymentProvider,
  ) {}

  async getOverview(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Negocio no encontrado.');
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [conversationsUsed, productsUsed] = await Promise.all([
      this.prisma.conversation.count({
        where: { tenantId, createdAt: { gte: monthStart } },
      }),
      this.prisma.product.count({ where: { tenantId } }),
    ]);

    const current = getPlanDefinition(effectivePlanTier(tenant));
    const checkoutMode = this.checkoutMode();

    return {
      notice:
        'Este es el plan de tu negocio en VendedorIA. Es independiente de los pagos que recibes de tus compradores.',
      currentPlan: current,
      currentPeriodEnd: current.id === tenant.planTier ? tenant.planExpiresAt : null,
      usage: {
        conversationsUsed,
        conversationQuota: current.conversationQuota,
        productsUsed,
        productQuota: current.productQuota,
        periodStart: monthStart.toISOString(),
      },
      plans: PLAN_CATALOG,
      checkoutEnabled: checkoutMode !== 'unavailable',
      checkoutSimulated: checkoutMode === 'simulated',
      checkoutHint:
        checkoutMode === 'unavailable'
          ? 'El pago de planes no está disponible en este momento. Escríbenos a soporte para cambiar de plan.'
          : `Cada pago activa el plan por ${PLAN_PERIOD_DAYS} días. Si renuevas el mismo plan, los días se suman.`,
    };
  }

  /** Paid plans are only granted by a confirmed payment; this only moves a tenant back to FREE. */
  async updatePlan(user: AuthUserPayload, planTier: PlanTier) {
    this.assertManager(user);
    if (planTier !== 'FREE') {
      throw new BadRequestException('Para cambiar a un plan pagado, completa el pago desde Planes.');
    }
    await this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: { planTier: 'FREE', planExpiresAt: null },
    });
    return this.getOverview(user.tenantId);
  }

  async createCheckout(user: AuthUserPayload, planTier: PlanTier) {
    this.assertManager(user);
    const plan = getPlanDefinition(planTier);
    if (plan.id !== planTier || !isPurchasable(plan)) {
      throw new BadRequestException('Este plan no se compra en línea. Escríbenos para cotizarlo.');
    }
    const mode = this.checkoutMode();
    if (mode === 'unavailable') {
      throw new ServiceUnavailableException(
        'El pago de planes no está disponible en este momento. Escríbenos a soporte.',
      );
    }
    const provider = mode === 'live' ? this.mercadoPago.name : 'mock';

    const reusable = await this.prisma.payment.findFirst({
      where: {
        tenantId: user.tenantId,
        flow: 'BILLING_SUBSCRIPTION',
        planTier,
        provider,
        status: 'PENDING',
        amountCents: plan.priceCents,
        checkoutUrl: { not: null },
        createdAt: { gte: new Date(Date.now() - CHECKOUT_REUSE_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (reusable?.checkoutUrl) {
      return { paymentId: reusable.id, checkoutUrl: reusable.checkoutUrl, simulated: mode === 'simulated' };
    }

    const payment = await this.prisma.payment.create({
      data: {
        tenantId: user.tenantId,
        flow: 'BILLING_SUBSCRIPTION',
        provider,
        status: 'PENDING',
        amountCents: plan.priceCents,
        currency: PLAN_CURRENCY,
        planTier,
        idempotencyKey: `billing:${user.tenantId}:${randomUUID()}`,
      },
    });

    const back = (state: string) => `${this.webOrigin()}/app/plans?payment=${state}`;
    let checkoutUrl: string;
    let externalId: string | null = null;
    let raw: unknown = { mode: 'mock' };
    if (mode === 'live') {
      const checkout = await this.mercadoPago.createCheckout(
        {
          idempotencyKey: payment.idempotencyKey,
          paymentId: payment.id,
          title: `Plan ${plan.name} VendedorIA · ${PLAN_PERIOD_DAYS} días`,
          amountCents: plan.priceCents,
          currency: PLAN_CURRENCY,
          notificationUrl: `${this.publicApiBase()}/webhooks/billing/mercadopago`,
          successUrl: back('success'),
          pendingUrl: back('pending'),
          failureUrl: back('failure'),
        },
        this.platformCredentials(),
      );
      checkoutUrl = checkout.checkoutUrl;
      externalId = checkout.externalId;
      raw = checkout.raw;
    } else {
      checkoutUrl = `${back('simulated')}&ref=${payment.id}`;
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { checkoutUrl, externalId, rawPayload: raw as Prisma.InputJsonValue },
    });
    return { paymentId: payment.id, checkoutUrl, simulated: mode === 'simulated' };
  }

  /** Back from Mercado Pago: confirms right away instead of waiting for the webhook. */
  async confirmReturn(user: AuthUserPayload, providerPaymentId: string): Promise<PlanPaymentResult> {
    const credentials = this.platformCredentials();
    if (!credentials) {
      throw new NotFoundException('Pago no encontrado.');
    }
    const event = await this.mercadoPago.fetchPaymentEvent(providerPaymentId, credentials);
    const payment = event.externalReference
      ? await this.prisma.payment.findFirst({
          where: { id: event.externalReference, tenantId: user.tenantId, flow: 'BILLING_SUBSCRIPTION' },
        })
      : null;
    if (!payment) {
      throw new NotFoundException('Pago no encontrado.');
    }
    return this.apply(payment.id, event, true);
  }

  /** Signed platform webhook (`type=payment`). The state is always read back from Mercado Pago. */
  async applyProviderPayment(providerPaymentId: string): Promise<PlanPaymentResult | null> {
    const credentials = this.platformCredentials();
    if (!credentials) return null;
    const event = await this.mercadoPago.fetchPaymentEvent(providerPaymentId, credentials);
    const payment = event.externalReference
      ? await this.prisma.payment.findFirst({
          where: { id: event.externalReference, flow: 'BILLING_SUBSCRIPTION' },
          select: { id: true },
        })
      : null;
    if (!payment) {
      this.logger.warn('Plan payment notification for an unknown payment');
      return null;
    }
    return this.apply(payment.id, event, true);
  }

  async simulatePayment(user: AuthUserPayload, paymentId: string): Promise<PlanPaymentResult> {
    this.assertManager(user);
    if (this.checkoutMode() !== 'simulated') {
      throw new BadRequestException('El pago simulado no está disponible.');
    }
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, tenantId: user.tenantId, flow: 'BILLING_SUBSCRIPTION', provider: 'mock' },
    });
    if (!payment) {
      throw new NotFoundException('Pago no encontrado.');
    }
    return this.apply(
      payment.id,
      {
        provider: 'mock',
        externalId: `MOCK-${payment.id}`,
        externalReference: payment.id,
        status: 'SUCCEEDED',
        raw: { mode: 'mock' },
      },
      false,
    );
  }

  /**
   * Moves a plan payment forward exactly once. The status change is a conditional update,
   * so concurrent webhooks and return confirmations credit the plan a single time.
   */
  private async apply(
    paymentId: string,
    event: NormalizedWebhookEvent,
    checkAmount: boolean,
  ): Promise<PlanPaymentResult> {
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (payment.status === 'SUCCEEDED') return { status: 'active' };

    if (event.status === 'PENDING') return { status: 'pending' };
    if (event.status !== 'SUCCEEDED') {
      await this.prisma.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: event.status, externalId: event.externalId, rawPayload: event.raw as Prisma.InputJsonValue },
      });
      return { status: 'failed' };
    }
    if (
      checkAmount &&
      (event.amountCents !== payment.amountCents || event.currency !== payment.currency)
    ) {
      this.logger.error(`Amount mismatch for plan payment ${payment.id}`);
      return { status: 'review' };
    }
    if (!payment.planTier) {
      this.logger.error(`Plan payment ${payment.id} has no plan`);
      return { status: 'review' };
    }
    const planTier = payment.planTier;

    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.payment.updateMany({
        where: { id: payment.id, status: { not: 'SUCCEEDED' } },
        data: {
          status: 'SUCCEEDED',
          externalId: event.externalId,
          rawPayload: event.raw as Prisma.InputJsonValue,
        },
      });
      if (moved.count !== 1) return;
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: payment.tenantId } });
      const now = new Date();
      const renewing =
        tenant.planTier === planTier && tenant.planExpiresAt && tenant.planExpiresAt > now;
      const start = renewing && tenant.planExpiresAt ? tenant.planExpiresAt : now;
      await tx.tenant.update({
        where: { id: tenant.id },
        data: { planTier, planExpiresAt: new Date(start.getTime() + PLAN_PERIOD_DAYS * DAY_MS) },
      });
    });
    return { status: 'active' };
  }

  private checkoutMode(): 'live' | 'simulated' | 'unavailable' {
    if (this.platformCredentials()) return 'live';
    return this.config.get<string>('NODE_ENV') === 'production' ? 'unavailable' : 'simulated';
  }

  private platformCredentials(): MerchantCredentials | null {
    const accessToken = this.config.get<string>('PLATFORM_MERCADOPAGO_ACCESS_TOKEN')?.trim();
    if (!accessToken) return null;
    return {
      accessToken,
      webhookSecret: this.config.get<string>('PLATFORM_MERCADOPAGO_WEBHOOK_SECRET')?.trim() || null,
      publicKey: '',
      liveMode: !accessToken.startsWith('TEST-'),
    };
  }

  private webOrigin(): string {
    return this.config.get<string>('CORS_ORIGIN')?.split(',')[0]?.trim() ?? 'http://localhost:4200';
  }

  private publicApiBase(): string {
    return (this.config.get<string>('PUBLIC_API_BASE_URL') ?? 'http://localhost:3000/api/v1').replace(/\/$/, '');
  }

  private assertManager(user: AuthUserPayload): void {
    if (!MANAGER_ROLES.includes(user.membershipRole)) {
      throw new ForbiddenException('Solo el dueño o un administrador puede cambiar el plan.');
    }
  }
}
