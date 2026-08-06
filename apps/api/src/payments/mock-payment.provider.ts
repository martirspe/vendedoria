import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateCheckoutInput,
  CreateCheckoutResult,
  NormalizedWebhookEvent,
  PaymentProviderPort,
} from './payment-provider.port';

/**
 * Local/dev provider used when Mercado Pago credentials are absent.
 * Keeps Flow B testable without coupling domain to a vendor.
 */
@Injectable()
export class MockPaymentProvider extends PaymentProviderPort {
  readonly name = 'mock';

  constructor(private readonly config: ConfigService) {
    super();
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const base =
      this.config.get<string>('PUBLIC_API_BASE_URL') ??
      'http://localhost:3000/api/v1';
    const externalId = `MOCK-${input.paymentId}`;
    return {
      provider: this.name,
      externalId,
      checkoutUrl: `${base}/payments/mock-checkout/${input.paymentId}`,
      raw: {
        mode: 'mock',
        amountCents: input.amountCents,
        currency: input.currency,
      },
    };
  }

  async parseWebhook(
    payload: unknown,
    _headers: Record<string, string | undefined>,
  ): Promise<NormalizedWebhookEvent> {
    const body = (payload ?? {}) as {
      paymentId?: string;
      status?: string;
      externalId?: string;
    };
    const statusRaw = (body.status ?? 'SUCCEEDED').toUpperCase();
    const status =
      statusRaw === 'SUCCEEDED' || statusRaw === 'APPROVED'
        ? 'SUCCEEDED'
        : statusRaw === 'FAILED' || statusRaw === 'REJECTED'
          ? 'FAILED'
          : statusRaw === 'CANCELLED'
            ? 'CANCELLED'
            : 'PENDING';

    return {
      provider: this.name,
      externalId: body.externalId ?? null,
      externalReference: body.paymentId ?? null,
      status,
      raw: payload,
    };
  }
}
