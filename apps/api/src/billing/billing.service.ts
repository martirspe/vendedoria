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
  AI_REPLIES_PER_CHAT,
  CHAT_PACKS,
  currentPeriodStart,
  findChatPack,
  findPrepayOption,
  getPlanDefinition,
  INCLUDED_IN_ALL_PLANS,
  isPurchasable,
  PLAN_CATALOG,
  PLAN_CURRENCY,
  PLAN_NOTES,
  PLAN_PERIOD_DAYS,
  PLAN_TRIAL_DAYS,
  PREPAY_OPTIONS,
  prepayTotalCents,
  resolvePlanState,
} from './plan-catalog';
import { PlanLimitsService } from './plan-limits.service';

const MANAGER_ROLES = ['OWNER', 'ADMIN'];
const DAY_MS = 24 * 60 * 60 * 1000;
/** A pending checkout is reused for the same purchase instead of opening a new one. */
const CHECKOUT_REUSE_MS = 6 * 60 * 60 * 1000;

export type PlanPaymentResult = {
  status: 'active' | 'pending' | 'failed' | 'review';
};

export type PlanPurchase = {
  planTier?: PlanTier;
  months?: number;
  chatPackSize?: number;
};

type ResolvedPurchase = {
  planTier: PlanTier | null;
  planMonths: number | null;
  chatPackSize: number | null;
  amountCents: number;
  title: string;
};

/** Flow A: the tenant pays VendedorIA for its plan, on the platform's own Mercado Pago account. */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mercadoPago: MercadoPagoPaymentProvider,
    private readonly planLimits: PlanLimitsService,
  ) {}

  async getOverview(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Negocio no encontrado.');
    }

    const state = resolvePlanState(tenant);
    const usage = await this.planLimits.getUsage(tenantId);
    const checkoutMode = this.checkoutMode();

    return {
      currentPlan: state.plan,
      planStatus: state.status,
      currentPeriodEnd: tenant.planExpiresAt,
      trialDays: PLAN_TRIAL_DAYS,
      usage,
      plans: PLAN_CATALOG.map((plan) => ({
        ...plan,
        prepay: isPurchasable(plan)
          ? PREPAY_OPTIONS.map((option) => {
              const totalCents = prepayTotalCents(plan.priceCents, option);
              return {
                ...option,
                totalCents,
                monthlyCents: Math.round(totalCents / option.months),
              };
            })
          : [],
      })),
      chatPacks: CHAT_PACKS.map((pack) => ({
        ...pack,
        aiReplies: pack.chats * AI_REPLIES_PER_CHAT,
      })),
      chatPacksAvailable: state.status === 'ACTIVE',
      includedInAllPlans: INCLUDED_IN_ALL_PLANS,
      notes: PLAN_NOTES,
      checkoutEnabled: checkoutMode !== 'unavailable',
      checkoutSimulated: checkoutMode === 'simulated',
      checkoutHint:
        checkoutMode === 'unavailable'
          ? 'Por ahora no puedes pagar tu plan desde aquí. Escríbenos desde Ayuda y lo activamos por ti.'
          : `Pagas por mes o por adelantado (3, 6 o 12 meses con descuento), sin contratos ni cobros automáticos. Cada mes pagado suma ${PLAN_PERIOD_DAYS} días. Si pagas el mismo plan antes de que termine (también durante la prueba de Crece), los días se suman. Si eliges otro plan, empieza el día del pago y reemplaza al actual.`,
    };
  }

  async createCheckout(user: AuthUserPayload, purchase: PlanPurchase) {
    this.assertManager(user);
    const resolved = await this.resolvePurchase(user.tenantId, purchase);
    const mode = this.checkoutMode();
    if (mode === 'unavailable') {
      throw new ServiceUnavailableException(
        'El pago de planes no está disponible en este momento. Escríbenos desde Ayuda.',
      );
    }
    const provider = mode === 'live' ? this.mercadoPago.name : 'mock';

    const reusable = await this.prisma.payment.findFirst({
      where: {
        tenantId: user.tenantId,
        flow: 'BILLING_SUBSCRIPTION',
        planTier: resolved.planTier,
        planMonths: resolved.planMonths,
        chatPackSize: resolved.chatPackSize,
        provider,
        status: 'PENDING',
        amountCents: resolved.amountCents,
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
        amountCents: resolved.amountCents,
        currency: PLAN_CURRENCY,
        planTier: resolved.planTier,
        planMonths: resolved.planMonths,
        chatPackSize: resolved.chatPackSize,
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
          title: resolved.title,
          amountCents: resolved.amountCents,
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
    const planTier = payment.planTier;
    const chatPackSize = payment.chatPackSize;
    if (!planTier && !chatPackSize) {
      this.logger.error(`Plan payment ${payment.id} has nothing to credit`);
      return { status: 'review' };
    }

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
      const now = new Date();
      if (!planTier) {
        // Chats count toward the month in which they were paid.
        await tx.chatPack.create({
          data: {
            tenantId: payment.tenantId,
            paymentId: payment.id,
            chats: chatPackSize ?? 0,
            periodStart: currentPeriodStart(now),
          },
        });
        return;
      }
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: payment.tenantId } });
      // Same plan still running (including the Crece trial): the new days are added at the end.
      const renewing =
        tenant.planTier === planTier && tenant.planExpiresAt && tenant.planExpiresAt > now;
      const start = renewing && tenant.planExpiresAt ? tenant.planExpiresAt : now;
      const days = (payment.planMonths ?? 1) * PLAN_PERIOD_DAYS;
      await tx.tenant.update({
        where: { id: tenant.id },
        data: {
          planTier,
          planTrial: false,
          planExpiresAt: new Date(start.getTime() + days * DAY_MS),
        },
      });
    });
    return { status: 'active' };
  }

  private async resolvePurchase(tenantId: string, purchase: PlanPurchase): Promise<ResolvedPurchase> {
    if (purchase.planTier && purchase.chatPackSize) {
      throw new BadRequestException('Elige un plan o un paquete de chats, no ambos.');
    }
    if (purchase.chatPackSize) {
      const pack = findChatPack(purchase.chatPackSize);
      if (!pack) {
        throw new BadRequestException('Ese paquete de chats no existe.');
      }
      const state = await this.planLimits.getPlanState(tenantId);
      if (state.status !== 'ACTIVE') {
        throw new BadRequestException(
          state.status === 'TRIAL'
            ? 'Los chats extra se suman a un plan pagado. Elige tu plan primero.'
            : 'Tu plan venció. Renuévalo para sumar chats extra.',
        );
      }
      return {
        planTier: null,
        planMonths: null,
        chatPackSize: pack.chats,
        amountCents: pack.priceCents,
        title: `${pack.chats} chats extra VendedorIA · este mes`,
      };
    }
    if (!purchase.planTier) {
      throw new BadRequestException('Elige un plan.');
    }
    const plan = getPlanDefinition(purchase.planTier);
    if (plan.id !== purchase.planTier || !isPurchasable(plan)) {
      throw new BadRequestException('Este plan no se compra en línea. Escríbenos para cotizarlo.');
    }
    const option = findPrepayOption(purchase.months ?? 1);
    if (!option) {
      throw new BadRequestException('Elige pagar 1, 3, 6 o 12 meses.');
    }
    return {
      planTier: plan.id,
      planMonths: option.months,
      chatPackSize: null,
      amountCents: prepayTotalCents(plan.priceCents, option),
      title:
        option.months === 1
          ? `Plan ${plan.name} VendedorIA · ${PLAN_PERIOD_DAYS} días`
          : `Plan ${plan.name} VendedorIA · ${option.months} meses`,
    };
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
