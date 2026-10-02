import { Injectable, Logger } from '@nestjs/common';
import type { MerchantCredentials } from './merchant-accounts.service';
import { mercadoPago } from './mercadopago.client';
import {
  CreateCheckoutInput,
  CreateCheckoutResult,
  NormalizedWebhookEvent,
  PaymentProviderPort,
} from './payment-provider.port';

/** Checkout Pro preferences charged to the tenant's own account. */
@Injectable()
export class MercadoPagoPaymentProvider extends PaymentProviderPort {
  readonly name = 'mercadopago';
  private readonly logger = new Logger(MercadoPagoPaymentProvider.name);

  async createCheckout(
    input: CreateCheckoutInput,
    credentials: MerchantCredentials | null,
  ): Promise<CreateCheckoutResult> {
    if (!credentials) {
      throw new Error('Mercado Pago credentials are required');
    }
    const payload = await mercadoPago
      .createPreference(
        credentials.accessToken,
        {
          items: [
            {
              id: input.orderId,
              title: input.title,
              quantity: 1,
              unit_price: Number((input.amountCents / 100).toFixed(2)),
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
          metadata: { orderId: input.orderId, paymentId: input.paymentId },
        },
        input.idempotencyKey,
      )
      .catch((error: unknown) => {
        this.logger.error(`Mercado Pago preference failed: ${String(error)}`);
        throw new Error('Mercado Pago checkout creation failed');
      });

    const checkoutUrl = payload.init_point ?? payload.sandbox_init_point ?? null;
    if (!payload.id || !checkoutUrl) {
      throw new Error('Mercado Pago response missing checkout URL');
    }
    return { provider: this.name, externalId: payload.id, checkoutUrl, raw: payload };
  }

  /** The webhook body is never trusted: the payment is fetched with the tenant token. */
  async fetchPaymentEvent(
    paymentId: string,
    credentials: MerchantCredentials,
  ): Promise<NormalizedWebhookEvent> {
    const payment = await mercadoPago.getPayment(credentials.accessToken, paymentId);
    return {
      provider: this.name,
      externalId: String(payment.id ?? paymentId),
      externalReference: payment.external_reference ?? null,
      status: mapPaymentStatus(payment.status),
      raw: payment,
    };
  }
}

function mapPaymentStatus(status?: string): NormalizedWebhookEvent['status'] {
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
