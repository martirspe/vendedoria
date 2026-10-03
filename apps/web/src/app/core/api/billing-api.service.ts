import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PlanDefinition = {
  id: 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';
  name: string;
  priceLabel: string;
  priceCents: number | null;
  conversationQuota: number | null;
  productQuota: number | null;
  highlights: string[];
};

export type BillingOverview = {
  notice: string;
  currentPlan: PlanDefinition;
  currentPeriodEnd: string | null;
  usage: {
    conversationsUsed: number;
    conversationQuota: number | null;
    productsUsed: number;
    productQuota: number | null;
    periodStart: string;
  };
  plans: PlanDefinition[];
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

  getUsage(): Promise<{
    planTier: string;
    conversationsUsed: number;
    conversationQuota: number | null;
    productsUsed: number;
    productQuota: number | null;
    conversationAtLimit: boolean;
    productAtLimit: boolean;
    periodStart: string;
  }> {
    return firstValueFrom(
      this.http.get<{
        planTier: string;
        conversationsUsed: number;
        conversationQuota: number | null;
        productsUsed: number;
        productQuota: number | null;
        conversationAtLimit: boolean;
        productAtLimit: boolean;
        periodStart: string;
      }>(`${environment.apiBaseUrl}/billing/usage`),
    );
  }

  updatePlan(planTier: PlanDefinition['id']): Promise<BillingOverview> {
    return firstValueFrom(
      this.http.patch<BillingOverview>(`${environment.apiBaseUrl}/billing/plan`, {
        planTier,
      }),
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
