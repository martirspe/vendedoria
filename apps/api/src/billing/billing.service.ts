import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Payment, PlanTier, Prisma } from '@prisma/client';
import type { AuthUserPayload } from '../common/types/auth-user';
import type { MerchantCredentials } from '../payments/merchant-accounts.service';
import {
  type MercadoPagoOrder,
  MercadoPagoError,
  isProviderOrderId,
  mercadoPago,
} from '../payments/mercadopago.client';
import { MercadoPagoPaymentProvider } from '../payments/mercadopago.provider';
import type { PayPlanDto } from './dto/plan-checkout.dto';
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
  /** Mercado Pago `status_detail` of a declined payment, e.g. `insufficient_amount`. */
  detail?: string | null;
};

/** Pending plan payment that the console pays in place with the Card Payment Brick or Yape. */
export type PlanCheckout = {
  paymentId: string;
  title: string;
  amountCents: number;
  currency: string;
  simulated: boolean;
  /** Platform public key; null when the payment is simulated. */
  publicKey: string | null;
  payerEmail: string;
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

  /**
   * Opens (or reuses) a pending plan payment. Nothing is charged here: the console tokenizes
   * the card or Yape with the platform public key and calls `pay`.
   */
  async createCheckout(user: AuthUserPayload, purchase: PlanPurchase): Promise<PlanCheckout> {
    this.assertManager(user);
    const resolved = await this.resolvePurchase(user.tenantId, purchase);
    if (this.checkoutMode() === 'unavailable') {
      throw new ServiceUnavailableException(
        'El pago de planes no está disponible en este momento. Escríbenos desde Ayuda.',
      );
    }
    const credentials = this.liveCredentials();
    const provider = credentials ? this.mercadoPago.name : 'mock';
    const session = (paymentId: string): PlanCheckout => ({
      paymentId,
      title: resolved.title,
      amountCents: resolved.amountCents,
      currency: PLAN_CURRENCY,
      simulated: !credentials,
      publicKey: credentials?.publicKey ?? null,
      payerEmail: user.email,
    });

    // Only payments never sent to Mercado Pago are reused: each one is a single charge attempt.
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
        externalId: null,
        createdAt: { gte: new Date(Date.now() - CHECKOUT_REUSE_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (reusable) return session(reusable.id);

    const id = randomUUID();
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
        idempotencyKey: `plan-${id}`,
      },
    });
    return session(payment.id);
  }

  /**
   * Charges a pending plan payment with a token created in the console (Orders API, platform
   * account). The payment's own idempotency key goes to Mercado Pago, so retries and double
   * submits never charge twice; a declined attempt closes the payment and the console opens
   * a new one.
   */
  async pay(user: AuthUserPayload, paymentId: string, dto: PayPlanDto): Promise<PlanPaymentResult> {
    this.assertManager(user);
    const credentials = this.liveCredentials();
    if (!credentials) {
      throw new BadRequestException('El pago con tarjeta o Yape no está disponible en este momento.');
    }
    const payment = await this.prisma.payment.findFirst({
      where: {
        id: paymentId,
        tenantId: user.tenantId,
        flow: 'BILLING_SUBSCRIPTION',
        provider: this.mercadoPago.name,
      },
    });
    if (!payment) {
      throw new NotFoundException('Pago no encontrado.');
    }
    if (payment.status === 'SUCCEEDED') return { status: 'active' };
    if (payment.status !== 'PENDING') {
      throw new ConflictException('Este pago ya terminó. Vuelve a elegir tu plan para intentarlo de nuevo.');
    }
    if (payment.externalId) {
      return this.refresh(payment, credentials);
    }

    const yape = dto.method === 'yape';
    const total = (payment.amountCents / 100).toFixed(2);
    const body = {
      type: 'online',
      processing_mode: 'automatic',
      external_reference: payment.id,
      total_amount: total,
      description: this.paymentTitle(payment),
      payer: {
        email: dto.payerEmail?.trim().toLowerCase() || user.email,
        ...(dto.identificationType && dto.identificationNumber
          ? { identification: { type: dto.identificationType, number: dto.identificationNumber } }
          : {}),
        ...(yape ? { entity_type: 'individual', phone: { area_code: '51', number: dto.phone } } : {}),
      },
      transactions: {
        payments: [
          {
            amount: total,
            payment_method: {
              id: yape ? 'yape' : dto.paymentMethodId,
              type: yape ? 'debit_card' : dto.paymentType,
              token: dto.cardToken,
              installments: 1,
            },
          },
        ],
      },
    };

    let providerOrder: MercadoPagoOrder;
    try {
      providerOrder = await mercadoPago.createOrder(credentials.accessToken, body, payment.idempotencyKey);
    } catch (error) {
      if (error instanceof MercadoPagoError && error.status >= 400 && error.status < 500) {
        await this.prisma.payment.updateMany({
          where: { id: payment.id, status: 'PENDING', externalId: null },
          data: { status: 'FAILED' },
        });
        return { status: 'failed', detail: null };
      }
      // Unknown outcome: the same idempotency key replays it, and the webhook settles it.
      this.logger.warn(`Plan payment ${payment.id} pending confirmation: ${(error as Error).message}`);
      return { status: 'pending' };
    }
    await this.prisma.payment.updateMany({
      where: { id: payment.id, externalId: null },
      data: { externalId: providerOrder.id },
    });
    return this.applyOrder(payment.id, providerOrder);
  }

  /** Console polling while a payment is processing; re-reads Mercado Pago when it can. */
  async paymentStatus(user: AuthUserPayload, paymentId: string): Promise<PlanPaymentResult> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, tenantId: user.tenantId, flow: 'BILLING_SUBSCRIPTION' },
    });
    if (!payment) {
      throw new NotFoundException('Pago no encontrado.');
    }
    if (payment.status === 'SUCCEEDED') return { status: 'active' };
    if (payment.status !== 'PENDING') return { status: 'failed', detail: null };
    const credentials = this.liveCredentials();
    return credentials && payment.externalId ? this.refresh(payment, credentials) : { status: 'pending' };
  }

  /** Signed platform webhook (`type=order`). The state is always read back from Mercado Pago. */
  async applyProviderOrder(providerOrderId: string): Promise<PlanPaymentResult | null> {
    const credentials = this.platformCredentials();
    if (!credentials) return null;
    const providerOrder = await mercadoPago.getOrder(credentials.accessToken, providerOrderId);
    const payment = await this.prisma.payment.findFirst({
      where: { id: providerOrder.external_reference, flow: 'BILLING_SUBSCRIPTION' },
      select: { id: true, externalId: true },
    });
    if (!payment || (payment.externalId && payment.externalId !== providerOrder.id)) {
      this.logger.warn('Plan order notification for an unknown payment');
      return null;
    }
    return this.applyOrder(payment.id, providerOrder);
  }

  /**
   * Signed platform webhook (`type=payment`) for Checkout Pro payments opened before plans
   * were paid in the console.
   */
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

  private async applyOrder(paymentId: string, providerOrder: MercadoPagoOrder): Promise<PlanPaymentResult> {
    const paid = providerOrder.status === 'processed' && providerOrder.status_detail === 'accredited';
    const failed = ['failed', 'canceled', 'cancelled', 'expired'].includes(providerOrder.status);
    const result = await this.apply(
      paymentId,
      {
        provider: this.mercadoPago.name,
        externalId: providerOrder.id,
        externalReference: providerOrder.external_reference,
        status: paid ? 'SUCCEEDED' : failed ? 'FAILED' : 'PENDING',
        amountCents: Math.round(Number(providerOrder.total_paid_amount ?? providerOrder.total_amount) * 100),
        currency: providerOrder.currency ?? PLAN_CURRENCY,
        raw: providerOrder,
      },
      true,
    );
    return result.status === 'failed'
      ? { ...result, detail: providerOrder.status_detail?.slice(0, 100) ?? null }
      : result;
  }

  private async refresh(payment: Payment, credentials: MerchantCredentials): Promise<PlanPaymentResult> {
    if (!payment.externalId || !isProviderOrderId(payment.externalId)) return { status: 'pending' };
    try {
      return await this.applyOrder(
        payment.id,
        await mercadoPago.getOrder(credentials.accessToken, payment.externalId),
      );
    } catch (error) {
      this.logger.warn(`Could not refresh plan payment ${payment.id}: ${(error as Error).message}`);
      return { status: 'pending' };
    }
  }

  private paymentTitle(payment: Pick<Payment, 'planTier' | 'chatPackSize'>): string {
    return payment.planTier
      ? `Plan ${getPlanDefinition(payment.planTier).name} VendedorIA`
      : `${payment.chatPackSize ?? 0} chats extra VendedorIA`;
  }

  private checkoutMode(): 'live' | 'simulated' | 'unavailable' {
    if (this.liveCredentials()) return 'live';
    return this.config.get<string>('NODE_ENV') === 'production' ? 'unavailable' : 'simulated';
  }

  /** Paying in the console needs the public key, and pending payments need the signed webhook. */
  private liveCredentials(): MerchantCredentials | null {
    const credentials = this.platformCredentials();
    return credentials?.publicKey && credentials.webhookSecret ? credentials : null;
  }

  private platformCredentials(): MerchantCredentials | null {
    const accessToken = this.config.get<string>('PLATFORM_MERCADOPAGO_ACCESS_TOKEN')?.trim();
    if (!accessToken) return null;
    return {
      accessToken,
      webhookSecret: this.config.get<string>('PLATFORM_MERCADOPAGO_WEBHOOK_SECRET')?.trim() || null,
      publicKey: this.config.get<string>('PLATFORM_MERCADOPAGO_PUBLIC_KEY')?.trim() ?? '',
      liveMode: !accessToken.startsWith('TEST-'),
    };
  }

  private assertManager(user: AuthUserPayload): void {
    if (!MANAGER_ROLES.includes(user.membershipRole)) {
      throw new ForbiddenException('Solo el dueño o un administrador puede cambiar el plan.');
    }
  }
}
