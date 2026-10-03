import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus, Prisma } from '@prisma/client';
import { InboxEventsService } from '../conversations/inbox-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { settlePaidOrder } from '../orders/settlement';
import { MerchantAccountsService, MerchantCredentials } from './merchant-accounts.service';
import { MercadoPagoPaymentProvider } from './mercadopago.provider';
import { MockPaymentProvider } from './mock-payment.provider';
import { NormalizedWebhookEvent, PaymentProviderPort } from './payment-provider.port';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly accounts: MerchantAccountsService,
    private readonly mercadoPago: MercadoPagoPaymentProvider,
    private readonly mock: MockPaymentProvider,
    private readonly inboxEvents: InboxEventsService,
  ) {}

  /** The tenant's account when connected; the simulator only outside production. */
  async providerFor(
    tenantId: string,
  ): Promise<{ provider: PaymentProviderPort; credentials: MerchantCredentials | null }> {
    const credentials = await this.accounts.credentials(tenantId);
    if (credentials) {
      return { provider: this.mercadoPago, credentials };
    }
    if (this.accounts.simulatorAllowed()) {
      return { provider: this.mock, credentials: null };
    }
    throw new BadRequestException(
      'Conecta tu cuenta de Mercado Pago en Integraciones para generar links de pago.',
    );
  }

  async providerStatus(tenantId: string) {
    const account = await this.accounts.view(tenantId);
    const simulated = !account.connected && account.simulatorAvailable;
    return {
      provider: account.connected ? 'mercadopago' : simulated ? 'mock' : 'none',
      mockMode: simulated,
      configured: account.connected,
    };
  }

  async createCommerceCheckout(params: {
    tenantId: string;
    orderId: string;
    title: string;
    amountCents: number;
    currency: string;
  }) {
    const order = await this.prisma.order.findFirst({
      where: { id: params.orderId, tenantId: params.tenantId },
    });
    if (!order) {
      throw new NotFoundException('Pedido no encontrado.');
    }
    if (order.status === 'CANCELLED' || order.status === 'COMPLETED') {
      throw new BadRequestException('Este pedido ya está cerrado; no se puede generar un link de pago.');
    }
    if (params.amountCents <= 0) {
      throw new BadRequestException('El total del pedido debe ser mayor a cero.');
    }
    const { provider, credentials } = await this.providerFor(params.tenantId);

    const idempotencyKey = createHash('sha256')
      .update(
        `commerce:${provider.name}:${params.tenantId}:${params.orderId}:${params.amountCents}:${params.currency}`,
      )
      .digest('hex');
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existing?.checkoutUrl && existing.status === 'PENDING') {
      return existing;
    }

    const webOrigin =
      this.config.get<string>('CORS_ORIGIN')?.split(',')[0]?.trim() ?? 'http://localhost:4200';
    const payment =
      existing ??
      (await this.prisma.payment.create({
        data: {
          tenantId: params.tenantId,
          orderId: params.orderId,
          flow: 'COMMERCE_CHECKOUT',
          provider: provider.name,
          status: 'PENDING',
          amountCents: params.amountCents,
          currency: params.currency,
          idempotencyKey,
        },
      }));

    const back = (state: string) =>
      `${webOrigin}/app/orders?payment=${state}&orderId=${params.orderId}`;
    const checkout = await provider.createCheckout(
      {
        idempotencyKey,
        orderId: params.orderId,
        paymentId: payment.id,
        title: params.title,
        amountCents: params.amountCents,
        currency: params.currency,
        notificationUrl: this.accounts.webhookUrl(params.tenantId),
        successUrl: back('success'),
        pendingUrl: back('pending'),
        failureUrl: back('failure'),
      },
      credentials,
    );

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        provider: checkout.provider,
        externalId: checkout.externalId,
        checkoutUrl: checkout.checkoutUrl,
        rawPayload: checkout.raw as Prisma.InputJsonValue,
        status: 'PENDING',
      },
    });
    if (order.status === 'DRAFT') {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: 'PENDING_PAYMENT' },
      });
    }
    return updated;
  }

  /** Checkout Pro notification (`type=payment`) for a tenant, already signature-checked. */
  async applyMercadoPagoPayment(
    tenantId: string,
    paymentId: string,
    credentials: MerchantCredentials,
  ) {
    const event = await this.mercadoPago.fetchPaymentEvent(paymentId, credentials);
    return this.applyEvent(event, tenantId);
  }

  async simulateMockPayment(tenantId: string, paymentId: string) {
    if (!this.accounts.simulatorAllowed()) {
      throw new BadRequestException('El pago simulado no está disponible.');
    }
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, tenantId, provider: 'mock', flow: 'COMMERCE_CHECKOUT' },
    });
    if (!payment) {
      throw new NotFoundException('Pago no encontrado.');
    }
    return this.applyEvent(
      this.mock.parseEvent({
        paymentId: payment.id,
        status: 'SUCCEEDED',
        externalId: payment.externalId,
      }),
      tenantId,
    );
  }

  getMockCheckoutPage(paymentId: string) {
    if (!this.accounts.simulatorAllowed()) {
      throw new NotFoundException();
    }
    return {
      provider: 'mock',
      paymentId,
      message:
        'Pago simulado. Usa "Simular pago" en Pedidos de la consola para completarlo en desarrollo.',
    };
  }

  private async applyEvent(event: NormalizedWebhookEvent, tenantId: string) {
    if (!event.externalReference && !event.externalId) {
      return { ok: true, ignored: true };
    }
    const orFilters: Prisma.PaymentWhereInput[] = [];
    if (event.externalReference) orFilters.push({ id: event.externalReference });
    if (event.externalId) orFilters.push({ externalId: event.externalId });

    const payment = await this.prisma.payment.findFirst({
      where: { tenantId, flow: 'COMMERCE_CHECKOUT', OR: orFilters },
    });
    if (!payment) {
      this.logger.warn('Payment notification for an unknown payment');
      return { ok: true, ignored: true };
    }
    if (
      payment.status === event.status ||
      (payment.status === 'SUCCEEDED' && event.status !== 'SUCCEEDED')
    ) {
      return { ok: true, idempotent: true, paymentId: payment.id };
    }

    let settledConversationId: string | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: event.status as PaymentStatus,
          externalId: event.externalId ?? payment.externalId,
          rawPayload: event.raw as Prisma.InputJsonValue,
        },
      });
      if (payment.orderId && event.status === 'SUCCEEDED') {
        const order = await tx.order.findUnique({
          where: { id: payment.orderId },
          include: { items: true },
        });
        if (order && (await settlePaidOrder(tx, order, `${event.provider}:${event.externalId ?? ''}`))) {
          settledConversationId = order.conversationId;
        }
      }
      return next;
    });
    if (settledConversationId) {
      this.inboxEvents.publish(tenantId, settledConversationId, 'conversation');
    }
    return { ok: true, paymentId: updated.id, status: updated.status };
  }
}
