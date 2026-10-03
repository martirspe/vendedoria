import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PlanDefinition = {
  id: 'STARTER' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';
  name: string;
  priceLabel: string;
  priceCents: number | null;
  conversationQuota: number | null;
  productQuota: number | null;
  couponQuota: number | null;
  platformBadge: boolean;
  description: string;
  note: string | null;
  highlights: string[];
};

/** TRIAL: Starter trial with reduced limits. EXPIRED: no new conversations or products until paying. */
export type PlanStatus = 'TRIAL' | 'ACTIVE' | 'EXPIRED';

export type PlanUsage = {
  planTier: PlanDefinition['id'];
  planStatus: PlanStatus;
  planExpiresAt: string | null;
  conversationsUsed: number;
  conversationQuota: number | null;
  productsUsed: number;
  productQuota: number | null;
  couponsActive: number;
  couponQuota: number | null;
  conversationAtLimit: boolean;
  productAtLimit: boolean;
  couponAtLimit: boolean;
  periodStart: string;
};

export type BillingOverview = {
  currentPlan: PlanDefinition;
  planStatus: PlanStatus;
  currentPeriodEnd: string | null;
  trialDays: number;
  usage: PlanUsage;
  plans: PlanDefinition[];
  includedInAllPlans: string[];
  notes: string[];
  checkoutEnabled: boolean;
  checkoutSimulated: boolean;
  checkoutHint: string;
};

export type PlanCheckout = {
  paymentId: string;
  checkoutUrl: string;
  simulated: boolean;
};

export type PlanPaymentResult = {
  status: 'active' | 'pending' | 'failed' | 'review';
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

  createCheckout(planTier: PlanDefinition['id']): Promise<PlanCheckout> {
    return firstValueFrom(
      this.http.post<PlanCheckout>(`${environment.apiBaseUrl}/billing/checkout`, {
        planTier,
      }),
    );
  }

  confirmPayment(providerPaymentId: string): Promise<PlanPaymentResult> {
    return firstValueFrom(
      this.http.post<PlanPaymentResult>(
        `${environment.apiBaseUrl}/billing/checkout/confirm`,
        { providerPaymentId },
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
