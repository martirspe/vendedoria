import { getPlanDefinition, isPurchasable, PLAN_CATALOG, resolvePlanState } from './plan-catalog';

const now = new Date('2026-10-03T12:00:00Z');
const future = new Date('2026-11-02T12:00:00Z');
const past = new Date('2026-10-01T12:00:00Z');

describe('plan catalog', () => {
  it('offers three plans bought online and one quoted plan', () => {
    expect(PLAN_CATALOG.filter(isPurchasable).map((plan) => plan.id)).toEqual(['STARTER', 'PRO', 'BUSINESS']);
    expect(isPurchasable(getPlanDefinition('ENTERPRISE'))).toBe(false);
  });

  it('grows every limit with the price', () => {
    const paid = PLAN_CATALOG.filter(isPurchasable);
    for (let i = 1; i < paid.length; i++) {
      const [lower, higher] = [paid[i - 1], paid[i]];
      expect(higher.priceCents).toBeGreaterThan(lower.priceCents);
      for (const key of ['conversationQuota', 'productQuota', 'couponQuota'] as const) {
        const value = higher[key];
        expect(value === null || value > (lower[key] ?? Infinity)).toBe(true);
      }
    }
  });

  it('applies the trial limits during the Starter trial', () => {
    const state = resolvePlanState({ planTier: 'STARTER', planTrial: true, planExpiresAt: future }, now);
    expect(state).toMatchObject({
      status: 'TRIAL',
      conversationQuota: 100,
      productQuota: 20,
      couponQuota: 3,
      platformBadge: true,
    });
  });

  it('applies the paid plan limits', () => {
    const state = resolvePlanState({ planTier: 'PRO', planTrial: false, planExpiresAt: future }, now);
    expect(state).toMatchObject({ status: 'ACTIVE', conversationQuota: 1200, platformBadge: false });
  });

  it('blocks new conversations and products and shows the badge once expired', () => {
    const state = resolvePlanState({ planTier: 'PRO', planTrial: false, planExpiresAt: past }, now);
    expect(state).toMatchObject({
      status: 'EXPIRED',
      conversationQuota: 0,
      productQuota: 0,
      couponQuota: 20,
      platformBadge: true,
    });
  });

  it('keeps a custom plan without expiry active and without fixed limits', () => {
    const state = resolvePlanState({ planTier: 'ENTERPRISE', planTrial: false, planExpiresAt: null }, now);
    expect(state).toMatchObject({ status: 'ACTIVE', conversationQuota: null, productQuota: null });
  });
});
