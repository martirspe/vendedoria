import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type IntegrationKey = 'store' | 'custom_domain' | 'instagram' | 'tracking' | 'team' | 'tiktok_live';

export type PrepayPrice = {
  months: number;
  discountPercent: number;
  label: string;
  totalCents: number;
  monthlyCents: number;
};

export type PlanDefinition = {
  id: 'START' | 'GROW' | 'SCALE' | 'LEAD' | 'ENTERPRISE';
  name: string;
  priceLabel: string;
  priceCents: number | null;
  conversationQuota: number | null;
  aiReplyQuota: number | null;
  aiTextQuota: number | null;
  aiImageQuota: number | null;
  productQuota: number | null;
  couponQuota: number | null;
  seatQuota: number | null;
  platformBadge: boolean;
  integrations: IntegrationKey[];
  description: string;
  note: string | null;
  highlights: string[];
  /** Price for paying 1, 3, 6 or 12 months at once; empty for quoted plans. */
  prepay: PrepayPrice[];
};

export type ChatPack = {
  chats: number;
  priceCents: number;
  aiReplies: number;
};

/** TRIAL: Crece trial with reduced limits. EXPIRED: no new conversations or products until paying. */
export type PlanStatus = 'TRIAL' | 'ACTIVE' | 'EXPIRED';

export type PlanUsage = {
  planTier: PlanDefinition['id'];
  planStatus: PlanStatus;
  planExpiresAt: string | null;
  conversationsUsed: number;
  /** Plan quota plus the chat packs bought for this month. */
  conversationQuota: number | null;
  extraChats: number;
  aiRepliesUsed: number;
  aiReplyQuota: number | null;
  /** Store editor AI, capped apart from the agent replies. */
  aiTextsUsed: number;
  aiTextQuota: number | null;
  aiImagesUsed: number;
  aiImageQuota: number | null;
  productsUsed: number;
  productQuota: number | null;
  couponsActive: number;
  couponQuota: number | null;
  seatsUsed: number;
  seatQuota: number | null;
  conversationAtLimit: boolean;
  aiAtLimit: boolean;
  aiTextAtLimit: boolean;
  aiImageAtLimit: boolean;
  productAtLimit: boolean;
  couponAtLimit: boolean;
  seatAtLimit: boolean;
  integrations: IntegrationKey[];
  periodStart: string;
};

export type PlanPurchase = { planTier: PlanDefinition['id']; months: number } | { chatPackSize: number };

export type BillingOverview = {
  currentPlan: PlanDefinition;
  planStatus: PlanStatus;
  currentPeriodEnd: string | null;
  trialDays: number;
  usage: PlanUsage;
  plans: PlanDefinition[];
  chatPacks: ChatPack[];
  /** Packs can only be added to a paid, active plan. */
  chatPacksAvailable: boolean;
  includedInAllPlans: string[];
  notes: string[];
  checkoutEnabled: boolean;
  checkoutSimulated: boolean;
  checkoutHint: string;
};

/** Pending plan payment, paid in the console with the Card Payment Brick or Yape. */
export type PlanCheckout = {
  paymentId: string;
  title: string;
  amountCents: number;
  currency: string;
  simulated: boolean;
  publicKey: string | null;
  payerEmail: string;
};

export type PlanPaymentResult = {
  status: 'active' | 'pending' | 'failed' | 'review';
  /** Mercado Pago `status_detail` of a declined payment. */
  detail?: string | null;
};

export type PayPlanRequest = {
  method: 'card' | 'yape';
  cardToken: string;
  paymentMethodId?: string;
  paymentType?: string;
  phone?: string;
  payerEmail?: string;
  identificationType?: 'DNI' | 'CE' | 'RUC';
  identificationNumber?: string;
};

@Injectable({ providedIn: 'root' })
export class BillingApiService {
  private readonly http = inject(HttpClient);

  getPlans(): Promise<BillingOverview> {
    return firstValueFrom(
      this.http.get<BillingOverview>(`${environment.apiBaseUrl}/billing/plans`),
    );
  }

  getUsage(): Promise<PlanUsage> {
    return firstValueFrom(
      this.http.get<PlanUsage>(`${environment.apiBaseUrl}/billing/usage`),
    );
  }

  createCheckout(purchase: PlanPurchase): Promise<PlanCheckout> {
    return firstValueFrom(
      this.http.post<PlanCheckout>(`${environment.apiBaseUrl}/billing/checkout`, purchase),
    );
  }

  payPlan(paymentId: string, body: PayPlanRequest): Promise<PlanPaymentResult> {
    return firstValueFrom(
      this.http.post<PlanPaymentResult>(
        `${environment.apiBaseUrl}/billing/payments/${encodeURIComponent(paymentId)}/pay`,
        body,
      ),
    );
  }

  paymentStatus(paymentId: string): Promise<PlanPaymentResult> {
    return firstValueFrom(
      this.http.get<PlanPaymentResult>(
        `${environment.apiBaseUrl}/billing/payments/${encodeURIComponent(paymentId)}`,
      ),
    );
  }

  simulatePayment(paymentId: string): Promise<PlanPaymentResult> {
    return firstValueFrom(
      this.http.post<PlanPaymentResult>(
        `${environment.apiBaseUrl}/billing/payments/${encodeURIComponent(paymentId)}/simulate`,
        {},
      ),
    );
  }
}
