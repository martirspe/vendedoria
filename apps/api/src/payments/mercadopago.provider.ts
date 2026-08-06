import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateCheckoutInput,
  CreateCheckoutResult,
  NormalizedWebhookEvent,
  PaymentProviderPort,
} from './payment-provider.port';

@Injectable()
export class MercadoPagoPaymentProvider extends PaymentProviderPort {
  readonly name = 'mercadopago';
  private readonly logger = new Logger(MercadoPagoPaymentProvider.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const token = this.config.getOrThrow<string>('MERCADOPAGO_ACCESS_TOKEN');
    const unitPrice = Number((input.amountCents / 100).toFixed(2));

    const response = await fetch(
      'https://api.mercadopago.com/checkout/preferences',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify({
          items: [
            {
              id: input.orderId,
              title: input.title,
              quantity: 1,
              unit_price: unitPrice,
              currency_id: input.currency,
            },
          ],
          external_reference: input.paymentId,
          notification_url: input.notificationUrl,
          back_urls: {
            success: input.successUrl,
            pending: input.pendingUrl,
            failure: input.failureUrl,
          },
          auto_return: 'approved',
          metadata: {
            orderId: input.orderId,
            paymentId: input.paymentId,
            flow: 'COMMERCE_CHECKOUT',
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Mercado Pago preference failed: ${errorText}`);
      throw new Error('Mercado Pago checkout creation failed');
    }

    const payload = (await response.json()) as {
      id?: string;
      init_point?: string;
      sandbox_init_point?: string;
    };

    const checkoutUrl =
      payload.init_point ?? payload.sandbox_init_point ?? null;
    if (!payload.id || !checkoutUrl) {
      throw new Error('Mercado Pago response missing checkout URL');
    }

    return {
      provider: this.name,
      externalId: payload.id,
      checkoutUrl,
      raw: payload,
    };
  }

  async parseWebhook(
    payload: unknown,
    _headers: Record<string, string | undefined>,
  ): Promise<NormalizedWebhookEvent> {
    const body = (payload ?? {}) as {
      type?: string;
      action?: string;
      data?: { id?: string };
      external_reference?: string;
      status?: string;
    };

    const paymentIdFromMp = body.data?.id;
    if (!paymentIdFromMp) {
      return {
        provider: this.name,
        externalId: null,
        externalReference: null,
        status: 'PENDING',
        raw: payload,
      };
    }

    const token = this.config.get<string>('MERCADOPAGO_ACCESS_TOKEN');
    if (!token) {
      return {
        provider: this.name,
        externalId: paymentIdFromMp,
        externalReference: null,
        status: 'PENDING',
        raw: payload,
      };
    }

    const paymentResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentIdFromMp}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!paymentResponse.ok) {
      this.logger.warn(
        `Unable to fetch Mercado Pago payment ${paymentIdFromMp}`,
      );
      return {
        provider: this.name,
        externalId: paymentIdFromMp,
        externalReference: null,
        status: 'PENDING',
        raw: payload,
      };
    }

    const payment = (await paymentResponse.json()) as {
      id?: number | string;
      status?: string;
      external_reference?: string;
    };

    return {
      provider: this.name,
      externalId: String(payment.id ?? paymentIdFromMp),
      externalReference: payment.external_reference ?? null,
      status: this.mapStatus(payment.status),
      raw: { webhook: payload, payment },
    };
  }

  private mapStatus(
    status?: string,
  ): NormalizedWebhookEvent['status'] {
    switch (status) {
      case 'approved':
        return 'SUCCEEDED';
      case 'rejected':
      case 'charged_back':
        return 'FAILED';
      case 'cancelled':
        return 'CANCELLED';
      default:
        return 'PENDING';
    }
  }
}
