import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PlanDefinition = {
  id: 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';
  name: string;
  priceLabel: string;
  conversationQuota: number | null;
  productQuota: number | null;
  highlights: string[];
};

export type BillingOverview = {
  flow: 'A';
  notice: string;
  currentPlan: PlanDefinition;
  usage: {
    conversationsUsed: number;
    conversationQuota: number | null;
    productsUsed: number;
    productQuota: number | null;
    periodStart: string;
  };
  plans: PlanDefinition[];
  checkoutEnabled: boolean;
  checkoutHint: string;
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
}
