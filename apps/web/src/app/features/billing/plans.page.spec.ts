import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { BillingApiService, type BillingOverview, type PlanDefinition } from '../../core/api/billing-api.service';
import { PlansPage } from './plans.page';

afterEach(() => TestBed.resetTestingModule());

describe('plan purchasing permissions', () => {
  it('allows consultation but never starts a purchase for an agent role', async () => {
    const api = { getPlans: async () => null, createCheckout: vi.fn(), simulatePayment: vi.fn() };
    TestBed.configureTestingModule({ providers: [
      { provide: BillingApiService, useValue: api },
      { provide: AuthApiService, useValue: { isManager: () => false } },
    ] });
    const page = TestBed.runInInjectionContext(() => new PlansPage());
    await page.load();
    const data = { checkoutEnabled: true, chatPacksAvailable: true } as BillingOverview;
    const plan: PlanDefinition = {
      id: 'GROW', name: 'Plan QA', priceLabel: 'S/ 100', priceCents: 10000,
      conversationQuota: 100, aiReplyQuota: 100, aiTextQuota: 0, aiImageQuota: 0,
      productQuota: 100, couponQuota: 0, seatQuota: 1, platformBadge: true,
      integrations: [], description: '', note: null, highlights: [], prepay: [],
    };
    page.overview.set(data);
    expect(page.canSelect(plan, data)).toBe(false);
    await page.selectPlan(plan);
    await page.buyChatPack({ chats: 100, priceCents: 1000, aiReplies: 100 });
    page.pendingSimulation.set('qa-payment');
    await page.confirmSimulation();
    expect(api.createCheckout).not.toHaveBeenCalled();
    expect(api.simulatePayment).not.toHaveBeenCalled();
  });
});
