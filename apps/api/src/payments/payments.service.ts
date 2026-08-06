import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PAYMENT_PROVIDER,
  PaymentProviderPort,
} from './payment-provider.port';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(PAYMENT_PROVIDER)
    private readonly provider: PaymentProviderPort,
  ) {}

  getProviderName() {
    return this.provider.name;
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
      include: { items: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.status === 'CANCELLED' || order.status === 'COMPLETED') {
      throw new BadRequestException(
        'Cannot create payment link for a closed order',
      );
    }
    if (params.amountCents <= 0) {
      throw new BadRequestException('Order total must be greater than zero');
    }

    const idempotencyKey = createHash('sha256')
      .update(
        `commerce:${params.tenantId}:${params.orderId}:${params.amountCents}:${params.currency}`,
      )
      .digest('hex');

    const existing = await this.prisma.payment.findUnique({
      where: { idempotencyKey },
    });
    if (existing?.checkoutUrl && existing.status === 'PENDING') {
      return existing;
    }

    const publicBase =
      this.config.get<string>('PUBLIC_API_BASE_URL') ??
      'http://localhost:3000/api/v1';
    const webOrigin =
      this.config.get<string>('CORS_ORIGIN')?.split(',')[0]?.trim() ??
      'http://localhost:4200';

    const payment = existing
      ? existing
      : await this.prisma.payment.create({
          data: {
            tenantId: params.tenantId,
            orderId: params.orderId,
            flow: 'COMMERCE_CHECKOUT',
            provider: this.provider.name,
            status: 'PENDING',
            amountCents: params.amountCents,
            currency: params.currency,
            idempotencyKey,
          },
        });

    const checkout = await this.provider.createCheckout({
      idempotencyKey,
      orderId: params.orderId,
      paymentId: payment.id,
      title: params.title,
      amountCents: params.amountCents,
      currency: params.currency,
      notificationUrl: `${publicBase}/webhooks/payments/${this.provider.name}`,
      successUrl: `${webOrigin}/app/orders?payment=success&orderId=${params.orderId}`,
      pendingUrl: `${webOrigin}/app/orders?payment=pending&orderId=${params.orderId}`,
      failureUrl: `${webOrigin}/app/orders?payment=failure&orderId=${params.orderId}`,
    });

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

  async handleWebhook(
    providerName: string,
    payload: unknown,
    headers: Record<string, string | undefined>,
  ) {
    if (providerName !== this.provider.name && providerName !== 'mercadopago') {
      // Allow mock webhook path even when MP is configured for local tooling.
      if (providerName !== 'mock') {
        throw new BadRequestException('Unknown payment provider webhook');
      }
    }

    this.assertMercadoPagoSignature(providerName, payload, headers);

    const event =
      providerName === 'mock' && this.provider.name !== 'mock'
        ? await this.parseMockFallback(payload)
        : await this.provider.parseWebhook(payload, headers);

    if (!event.externalReference && !event.externalId) {
      return { ok: true, ignored: true };
    }

    const orFilters: Prisma.PaymentWhereInput[] = [];
    if (event.externalReference) {
      orFilters.push({ id: event.externalReference });
    }
    if (event.externalId) {
      orFilters.push({ externalId: event.externalId });
    }

    const payment = await this.prisma.payment.findFirst({
      where: { OR: orFilters },
      include: { order: { include: { items: true } } },
    });

    if (!payment) {
      this.logger.warn('Webhook for unknown payment');
      return { ok: true, ignored: true };
    }

    if (payment.status === event.status) {
      return { ok: true, idempotent: true, paymentId: payment.id };
    }

    // Idempotent success: never downgrade SUCCEEDED.
    if (payment.status === 'SUCCEEDED' && event.status !== 'SUCCEEDED') {
      return { ok: true, idempotent: true, paymentId: payment.id };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextPayment = await tx.payment.update({
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
        if (order && order.status !== 'PAID' && order.status !== 'CANCELLED') {
          await tx.order.update({
            where: { id: order.id },
            data: { status: 'PAID' },
          });
          await this.decrementStock(tx, order.items);
          if (order.conversationId) {
            await tx.conversation.update({
              where: { id: order.conversationId },
              data: { markedAsSale: true },
            });
            await tx.message.create({
              data: {
                conversationId: order.conversationId,
                direction: 'OUTBOUND',
                authorType: 'SYSTEM',
                body: `Pago confirmado · pedido ${order.id.slice(-6).toUpperCase()} · ${(order.totalCents / 100).toFixed(2)} ${order.currency}`,
              },
            });
          }
        }
      }

      if (
        payment.orderId &&
        (event.status === 'FAILED' || event.status === 'CANCELLED')
      ) {
        const order = await tx.order.findUnique({
          where: { id: payment.orderId },
        });
        if (order && order.status === 'PENDING_PAYMENT') {
          // Keep PENDING_PAYMENT on failed attempts so merchant can retry link.
        }
      }

      return nextPayment;
    });

    return { ok: true, paymentId: updated.id, status: updated.status };
  }

  async simulateMockPayment(tenantId: string, paymentId: string) {
    if (this.provider.name !== 'mock') {
      throw new BadRequestException(
        'Simulate payment is only available with the mock provider',
      );
    }
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, tenantId },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    return this.handleWebhook(
      'mock',
      { paymentId: payment.id, status: 'SUCCEEDED', externalId: payment.externalId },
      {},
    );
  }

  getMockCheckoutPage(paymentId: string) {
    return {
      provider: 'mock',
      paymentId,
      message:
        'Mock checkout. Use the console action “Simular pago” or POST the mock webhook to complete Flow B locally.',
    };
  }

  private async parseMockFallback(payload: unknown) {
    const body = (payload ?? {}) as {
      paymentId?: string;
      status?: string;
      externalId?: string;
    };
    return {
      provider: 'mock',
      externalId: body.externalId ?? null,
      externalReference: body.paymentId ?? null,
      status: (body.status?.toUpperCase() === 'SUCCEEDED'
        ? 'SUCCEEDED'
        : 'PENDING') as NormalizedWebhookEventStatus,
      raw: payload,
    };
  }

  private assertMercadoPagoSignature(
    providerName: string,
    payload: unknown,
    headers: Record<string, string | undefined>,
  ) {
    if (providerName !== 'mercadopago') {
      return;
    }
    const secret = this.config.get<string>('MERCADOPAGO_WEBHOOK_SECRET');
    if (!secret) {
      return;
    }
    const signatureHeader = headers['x-signature'];
    const requestId = headers['x-request-id'];
    if (!signatureHeader || !requestId) {
      throw new BadRequestException('Missing Mercado Pago signature headers');
    }

    const parts = Object.fromEntries(
      signatureHeader.split(',').map((part) => {
        const [key, value] = part.split('=');
        return [key.trim(), value?.trim() ?? ''];
      }),
    );
    const ts = parts['ts'];
    const v1 = parts['v1'];
    const dataId =
      typeof payload === 'object' &&
      payload &&
      'data' in payload &&
      typeof (payload as { data?: { id?: string } }).data?.id !== 'undefined'
        ? String((payload as { data: { id: string } }).data.id)
        : '';

    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const expected = createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');

    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(v1 ?? '');
    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new BadRequestException('Invalid Mercado Pago signature');
    }
  }

  private async decrementStock(
    tx: Prisma.TransactionClient,
    items: Array<{ productId: string | null; quantity: number }>,
  ) {
    for (const item of items) {
      if (!item.productId) continue;
      const product = await tx.product.findUnique({
        where: { id: item.productId },
      });
      if (!product || product.stockUnlimited || product.stockQty == null) {
        continue;
      }
      await tx.product.update({
        where: { id: product.id },
        data: {
          stockQty: Math.max(0, product.stockQty - item.quantity),
        },
      });
    }
  }
}

type NormalizedWebhookEventStatus =
  | 'PENDING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED';
