import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateCheckoutInput,
  CreateCheckoutResult,
  NormalizedWebhookEvent,
  PaymentProviderPort,
} from './payment-provider.port';

/**
 * Development simulator used while a tenant has no Mercado Pago account.
 * Never selected in production.
 */
@Injectable()
export class MockPaymentProvider extends PaymentProviderPort {
  readonly name = 'mock';

  constructor(private readonly config: ConfigService) {
    super();
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const base =
      this.config.get<string>('PUBLIC_API_BASE_URL') ?? 'http://localhost:3000/api/v1';
    return {
      provider: this.name,
      externalId: `MOCK-${input.paymentId}`,
      checkoutUrl: `${base}/payments/mock-checkout/${input.paymentId}`,
      raw: { mode: 'mock', amountCents: input.amountCents, currency: input.currency },
    };
  }

  parseEvent(payload: unknown): NormalizedWebhookEvent {
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
