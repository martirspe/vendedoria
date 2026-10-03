import type { MerchantCredentials } from './merchant-accounts.service';

export type CreateCheckoutInput = {
  idempotencyKey: string;
  /** Buyer order (flow B); plan payments (flow A) have none. */
  orderId?: string;
  paymentId: string;
  title: string;
  amountCents: number;
  currency: string;
  payerEmail?: string | null;
  notificationUrl: string;
  successUrl: string;
  pendingUrl: string;
  failureUrl: string;
};

export type CreateCheckoutResult = {
  provider: string;
  externalId: string;
  checkoutUrl: string;
  raw: unknown;
};

export type NormalizedWebhookEvent = {
  provider: string;
  externalId: string | null;
  externalReference: string | null;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  /** Amount actually charged, when the provider reports it. */
  amountCents?: number;
  currency?: string;
  raw: unknown;
};

/** Hosted checkout links (sent by the agent or the console). */
export abstract class PaymentProviderPort {
  abstract readonly name: string;

  abstract createCheckout(
    input: CreateCheckoutInput,
    credentials: MerchantCredentials | null,
  ): Promise<CreateCheckoutResult>;
}
