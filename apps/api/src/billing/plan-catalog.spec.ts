import {
  AI_REPLIES_PER_CHAT,
  CHAT_PACKS,
  findChatPack,
  findPrepayOption,
  firstPlanWith,
  getPlanDefinition,
  isPurchasable,
  PLAN_CATALOG,
  planAllows,
  PREPAY_OPTIONS,
  prepayTotalCents,
  resolvePlanState,
} from './plan-catalog';

const now = new Date('2026-10-03T12:00:00Z');
const future = new Date('2026-11-02T12:00:00Z');
const past = new Date('2026-10-01T12:00:00Z');

describe('plan catalog', () => {
  it('offers four plans bought online, in growing order, and one quoted plan', () => {
    expect(PLAN_CATALOG.filter(isPurchasable).map((plan) => plan.id)).toEqual(['START', 'GROW', 'SCALE', 'LEAD']);
    expect(PLAN_CATALOG.filter(isPurchasable).map((plan) => plan.name)).toEqual(['Inicia', 'Crece', 'Escala', 'Lidera']);
    expect(isPurchasable(getPlanDefinition('ENTERPRISE'))).toBe(false);
  });

  it('grows every limit and integration with the price', () => {
    const paid = PLAN_CATALOG.filter(isPurchasable);
    for (let i = 1; i < paid.length; i++) {
      const [lower, higher] = [paid[i - 1], paid[i]];
      expect(higher.priceCents).toBeGreaterThan(lower.priceCents);
      for (const key of [
        'conversationQuota',
        'aiReplyQuota',
        'aiTextQuota',
        'aiImageQuota',
        'productQuota',
        'couponQuota',
        'seatQuota',
      ] as const) {
        const value = higher[key];
        expect(value === null || value > (lower[key] ?? Infinity)).toBe(true);
      }
      expect(lower.integrations.every((key) => higher.integrations.includes(key))).toBe(true);
    }
  });

  it('caps AI replies per chat on every paid plan', () => {
    for (const plan of PLAN_CATALOG.filter(isPurchasable)) {
      expect(plan.aiReplyQuota).toBe((plan.conversationQuota ?? 0) * AI_REPLIES_PER_CHAT);
    }
  });

  it('gives store editor AI only to plans with the web store', () => {
    for (const plan of PLAN_CATALOG) {
      const hasStore = plan.integrations.includes('store');
      expect(plan.aiTextQuota !== 0).toBe(hasStore);
      expect(plan.aiImageQuota !== 0).toBe(hasStore);
    }
  });

  it('applies the trial limits during the Crece trial', () => {
    const state = resolvePlanState({ planTier: 'GROW', planTrial: true, planExpiresAt: future }, now);
    expect(state).toMatchObject({
      status: 'TRIAL',
      conversationQuota: 100,
      aiReplyQuota: 100 * AI_REPLIES_PER_CHAT,
      aiTextQuota: 100,
      aiImageQuota: 10,
      productQuota: 20,
      couponQuota: 3,
      seatQuota: 2,
      platformBadge: true,
    });
    expect(planAllows(state, 'custom_domain')).toBe(true);
    expect(planAllows(state, 'tracking')).toBe(false);
  });

  it('applies the paid plan limits', () => {
    const state = resolvePlanState({ planTier: 'SCALE', planTrial: false, planExpiresAt: future }, now);
    expect(state).toMatchObject({ status: 'ACTIVE', conversationQuota: 1200, seatQuota: 5, platformBadge: false });
    expect(planAllows(state, 'tracking')).toBe(true);
  });

  it('blocks new conversations, AI, products and integrations once expired', () => {
    const state = resolvePlanState({ planTier: 'SCALE', planTrial: false, planExpiresAt: past }, now);
    expect(state).toMatchObject({
      status: 'EXPIRED',
      conversationQuota: 0,
      aiReplyQuota: 0,
      aiTextQuota: 0,
      aiImageQuota: 0,
      productQuota: 0,
      couponQuota: 20,
      platformBadge: true,
      integrations: [],
    });
    expect(planAllows(state, 'custom_domain')).toBe(false);
  });

  it('includes the web store from Crece up and in the trial, never once expired', () => {
    const at = (planTier: 'START' | 'GROW' | 'SCALE' | 'LEAD' | 'ENTERPRISE', planTrial = false, expires = future) =>
      planAllows(resolvePlanState({ planTier, planTrial, planExpiresAt: expires }, now), 'store');
    expect(at('START')).toBe(false);
    expect(at('GROW', true)).toBe(true);
    expect((['GROW', 'SCALE', 'LEAD', 'ENTERPRISE'] as const).every((tier) => at(tier))).toBe(true);
    expect(at('SCALE', false, past)).toBe(false);
    expect(firstPlanWith('store')?.id).toBe('GROW');
  });

  it('keeps a custom plan without expiry active and without fixed limits', () => {
    const state = resolvePlanState({ planTier: 'ENTERPRISE', planTrial: false, planExpiresAt: null }, now);
    expect(state).toMatchObject({ status: 'ACTIVE', conversationQuota: null, productQuota: null, seatQuota: null });
  });

  it('points upgrade hints to the cheapest plan with the integration', () => {
    expect(firstPlanWith('instagram')?.id).toBe('START');
    expect(firstPlanWith('custom_domain')?.id).toBe('GROW');
    expect(firstPlanWith('team')?.id).toBe('GROW');
    expect(firstPlanWith('tracking')?.id).toBe('SCALE');
  });
});

describe('prepay and chat packs', () => {
  it('offers monthly, 3, 6 and 12 months with growing discounts', () => {
    expect(PREPAY_OPTIONS.map((option) => [option.months, option.discountPercent])).toEqual([
      [1, 0],
      [3, 5],
      [6, 10],
      [12, 17],
    ]);
    expect(findPrepayOption(2)).toBeUndefined();
  });

  it('rounds prepaid totals to whole soles', () => {
    expect(prepayTotalCents(7_900, findPrepayOption(1)!)).toBe(7_900);
    expect(prepayTotalCents(7_900, findPrepayOption(3)!)).toBe(22_500);
    expect(prepayTotalCents(7_900, findPrepayOption(12)!)).toBe(78_700);
    for (const option of PREPAY_OPTIONS) {
      expect(prepayTotalCents(19_900, option) % 100).toBe(0);
    }
  });

  it('sells chat packs cheaper per chat as they grow', () => {
    for (let i = 1; i < CHAT_PACKS.length; i++) {
      const perChat = (pack: (typeof CHAT_PACKS)[number]) => pack.priceCents / pack.chats;
      expect(perChat(CHAT_PACKS[i])).toBeLessThanOrEqual(perChat(CHAT_PACKS[i - 1]));
    }
    expect(findChatPack(500)?.priceCents).toBe(6_500);
    expect(findChatPack(50)).toBeUndefined();
  });
});
