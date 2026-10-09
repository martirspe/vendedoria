import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { BillingApiService, type BillingOverview, type PlanDefinition, type PlanCheckout, type PlanPurchase } from '../../core/api/billing-api.service';
import { PlansPage } from './plans.page';

beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} })));
afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

const plan: PlanDefinition = { id: 'GROW', name: 'Plan de prueba', priceLabel: 'S/ 100 al mes', priceCents: 10000, conversationQuota: 100, aiReplyQuota: 1000, aiTextQuota: 0, aiImageQuota: 0, productQuota: 100, couponQuota: 0, seatQuota: 2, platformBadge: true, integrations: [], description: 'Plan para pruebas', note: null, highlights: ['100 conversaciones'], prepay: [{ months: 1, discountPercent: 0, label: '1 mes', totalCents: 10000, monthlyCents: 10000 }, { months: 3, discountPercent: 10, label: '3 meses', totalCents: 27000, monthlyCents: 9000 }] };
const overview: BillingOverview = {
  currentPlan: plan, planStatus: 'ACTIVE', currentPeriodEnd: null, trialDays: 7,
  usage: { planTier: 'GROW', planStatus: 'ACTIVE', planExpiresAt: null, conversationsUsed: 20, conversationQuota: 100, extraChats: 0, aiRepliesUsed: 20, aiReplyQuota: 1000, aiTextsUsed: 0, aiTextQuota: 0, aiImagesUsed: 0, aiImageQuota: 0, productsUsed: 5, productQuota: 100, couponsActive: 0, couponQuota: 0, seatsUsed: 1, seatQuota: 2, conversationAtLimit: false, aiAtLimit: false, aiTextAtLimit: false, aiImageAtLimit: false, productAtLimit: false, couponAtLimit: false, seatAtLimit: false, integrations: [], periodStart: '2026-10-01T00:00:00Z' },
  plans: [plan], chatPacks: [{ chats: 100, priceCents: 1000, aiReplies: 1000 }], chatPacksAvailable: true, includedInAllPlans: ['Catálogo'], notes: ['Sin renovación automática'], checkoutEnabled: true, checkoutSimulated: false, checkoutHint: 'Paga tu suscripción.',
};
const checkout: PlanCheckout = { paymentId: 'test-payment', title: 'Plan de prueba', amountCents: 10000, currency: 'PEN', simulated: false, publicKey: null, payerEmail: 'payer@example.test' };
async function setup(data = overview) {
  const api = { getPlans: vi.fn<() => Promise<BillingOverview>>().mockResolvedValue(data), createCheckout: vi.fn<(purchase: PlanPurchase) => Promise<PlanCheckout>>().mockResolvedValue(checkout), simulatePayment: vi.fn(async () => ({ status: 'active' as const })) };
  TestBed.configureTestingModule({ imports: [PlansPage], providers: [provideRouter([]), { provide: BillingApiService, useValue: api }, { provide: AuthApiService, useValue: { isManager: () => true } }] });
  const fixture = TestBed.createComponent(PlansPage); fixture.detectChanges(); await fixture.whenStable();
  await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false)); fixture.detectChanges();
  return { page: fixture.componentInstance, fixture, api };
}

describe('Plan comparison and checkout recovery', () => {
  it('renders the API current plan without prepay and resolves its price from the catalog', async () => {
    const data = { ...overview, currentPlan: { ...plan } };
    Reflect.deleteProperty(data.currentPlan, 'prepay');
    const { page, fixture } = await setup(data);
    expect(fixture.nativeElement.textContent).toContain('Tu plan');
    expect(page.priceFor(data.currentPlan)?.totalCents).toBe(10000);
  });
  it('shows the total and monthly equivalent for the selected period', async () => {
    const { page, fixture } = await setup(); page.setMonths(3); fixture.detectChanges();
    expect(page.priceFor(plan)?.totalCents).toBe(27000); expect(fixture.nativeElement.textContent).toContain('Total a pagar:'); expect(fixture.nativeElement.textContent).toContain('/mes equivalente');
    page.setMonths(99); expect(page.months()).toBe(3); expect(page.canSelect({ ...plan, prepay: [] }, overview)).toBe(false);
  });
  it('prevents duplicate purchase and locks period selection while opening checkout', async () => {
    const { page, api } = await setup(); let reject!: (error: Error) => void;
    api.createCheckout.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const opening = page.selectPlan(plan); page.setMonths(3); await page.selectPlan(plan); await page.buyChatPack(overview.chatPacks[0]);
    expect(api.createCheckout).toHaveBeenCalledTimes(1); expect(page.months()).toBe(1);
    reject(new Error('Offline')); await opening; expect(page.overview()).toEqual(overview); expect(page.errorMessage()).toBeTruthy(); expect(page.saving()).toBe(false);
  });
  it('retains an active checkout and prevents a second plan or pack purchase', async () => {
    const { page, api } = await setup(); await page.selectPlan(plan); page.setMonths(3); await page.buyChatPack(overview.chatPacks[0]); await page.selectPlan(plan); await page.load();
    expect(page.activeCheckout()?.checkout).toEqual(checkout); expect(api.createCheckout).toHaveBeenCalledTimes(1); expect(api.getPlans).toHaveBeenCalledTimes(1);
    page.closeCheckout(); expect(page.canSelect(plan, overview)).toBe(true);
  });
  it('keeps payment success separate from a failed overview refresh', async () => {
    const { page, api } = await setup(); await page.selectPlan(plan); api.getPlans.mockRejectedValueOnce(new Error('Offline')); await page.onCheckoutCompleted({ status: 'active' });
    expect(page.successMessage()).toBeTruthy(); expect(page.overviewError()).toBeTruthy(); expect(page.overview()).toEqual(overview); expect(page.canSelect(plan, overview)).toBe(false);
    await page.load(); expect(page.overviewError()).toBeNull(); expect(page.successMessage()).toBeTruthy();
  });
  it('keeps simulated payment confirmation available after failure', async () => {
    const { page, fixture, api } = await setup(); api.createCheckout.mockResolvedValueOnce({ ...checkout, simulated: true }); await page.selectPlan(plan);
    api.simulatePayment.mockRejectedValueOnce(new Error('Offline')); await page.confirmSimulation(); fixture.detectChanges();
    expect(page.pendingSimulation()).toBe(checkout.paymentId); expect(fixture.nativeElement.textContent).toContain('Confirmar pago de prueba'); expect(page.canSelect(plan, overview)).toBe(false);
    await page.confirmSimulation(); expect(page.pendingSimulation()).toBeNull();
  });
  it('preserves last usage on load failure and recovers without changing cents', async () => {
    const { page, api } = await setup(); api.getPlans.mockRejectedValueOnce(new Error('Offline')); await page.load();
    expect(page.overview()?.usage.conversationsUsed).toBe(20); expect(page.overviewError()).toBeTruthy(); await page.load(); expect(page.overviewError()).toBeNull(); expect(page.money(12345)).toContain('123.45');
  });
});

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
