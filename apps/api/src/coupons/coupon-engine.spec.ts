import {
  type CouponLine,
  type CouponRule,
  couponRuleError,
  evaluateCoupon,
  MIN_CHARGE_CENTS,
} from './coupon-engine';

const base: CouponRule = {
  kind: 'PERCENT',
  value: 10,
  maxDiscountCents: null,
  buyQuantity: null,
  getQuantity: null,
  maxApplications: null,
  minSubtotalCents: 0,
  minItems: 0,
  scope: 'ALL',
  targets: [],
  startsAt: null,
  endsAt: null,
  isActive: true,
};

const line = (over: Partial<CouponLine> = {}): CouponLine => ({
  handle: 'polo',
  categories: ['polos'],
  brand: 'Andina',
  unitCents: 5000,
  quantity: 1,
  ...over,
});

describe('evaluateCoupon', () => {
  it('applies a percent discount over eligible lines only', () => {
    const result = evaluateCoupon({ ...base, scope: 'CATEGORY', targets: ['polos'] }, [
      line({ quantity: 2 }),
      line({ handle: 'gorra', categories: ['accesorios'], unitCents: 3000 }),
    ]);
    expect(result).toEqual({ ok: true, discountCents: 1000, eligibleCents: 10000, freeShipping: false });
  });

  it('caps percent discounts with maxDiscountCents', () => {
    const result = evaluateCoupon({ ...base, value: 50, maxDiscountCents: 1500 }, [line()]);
    expect(result).toMatchObject({ ok: true, discountCents: 1500 });
  });

  it('never leaves the charge below the minimum', () => {
    const result = evaluateCoupon({ ...base, kind: 'FIXED', value: 10000 }, [line()]);
    expect(result).toMatchObject({ ok: true, discountCents: 5000 - MIN_CHARGE_CENTS });
  });

  it('rejects inactive, future and expired coupons', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(evaluateCoupon({ ...base, isActive: false }, [line()], now).ok).toBe(false);
    expect(
      evaluateCoupon({ ...base, startsAt: new Date('2026-07-01') }, [line()], now),
    ).toMatchObject({ ok: false, reason: 'Este cupón aún no está vigente.' });
    expect(
      evaluateCoupon({ ...base, endsAt: new Date('2026-06-01T00:00:00Z') }, [line()], now),
    ).toMatchObject({ ok: false, reason: 'Este cupón ya venció.' });
  });

  it('explains how much is missing for the minimum subtotal', () => {
    const result = evaluateCoupon({ ...base, minSubtotalCents: 8000 }, [line()]);
    expect(result).toEqual({
      ok: false,
      reason: 'Agrega S/ 30.00 más en productos participantes para usar este cupón.',
    });
  });

  it('matches brand and product scopes', () => {
    expect(evaluateCoupon({ ...base, scope: 'BRAND', targets: ['Otra'] }, [line()]).ok).toBe(false);
    expect(evaluateCoupon({ ...base, scope: 'BRAND', targets: ['Andina'] }, [line()]).ok).toBe(true);
    expect(evaluateCoupon({ ...base, scope: 'PRODUCTS', targets: ['polo'] }, [line()]).ok).toBe(true);
    expect(
      evaluateCoupon({ ...base, scope: 'BRAND', targets: ['Andina'] }, [line({ brand: null })]).ok,
    ).toBe(false);
  });

  it('grants free shipping without a money discount', () => {
    const result = evaluateCoupon({ ...base, kind: 'FREE_SHIPPING', value: 0 }, [line()]);
    expect(result).toEqual({ ok: true, discountCents: 0, eligibleCents: 5000, freeShipping: true });
  });

  it('discounts the cheapest units on buy X get Y', () => {
    const coupon: CouponRule = { ...base, kind: 'BUY_X_GET_Y', value: 100, buyQuantity: 2, getQuantity: 1 };
    const result = evaluateCoupon(coupon, [
      line({ unitCents: 5000, quantity: 2 }),
      line({ handle: 'polo-b', unitCents: 3000, quantity: 1 }),
    ]);
    expect(result).toMatchObject({ ok: true, discountCents: 3000 });
  });

  it('limits buy X get Y groups with maxApplications', () => {
    const coupon: CouponRule = {
      ...base,
      kind: 'BUY_X_GET_Y',
      value: 50,
      buyQuantity: 1,
      getQuantity: 1,
      maxApplications: 1,
    };
    const result = evaluateCoupon(coupon, [line({ quantity: 4 })]);
    expect(result).toMatchObject({ ok: true, discountCents: 2500 });
  });

  it('asks for more units when buy X get Y is incomplete', () => {
    const coupon: CouponRule = { ...base, kind: 'BUY_X_GET_Y', value: 100, buyQuantity: 2, getQuantity: 1 };
    expect(evaluateCoupon(coupon, [line()])).toEqual({
      ok: false,
      reason: 'Agrega 2 productos participantes más para activar esta promoción.',
    });
  });
});

describe('couponRuleError', () => {
  const rules = {
    kind: 'PERCENT' as const,
    value: 10,
    maxDiscountCents: null,
    buyQuantity: null,
    getQuantity: null,
    maxApplications: null,
    scope: 'ALL' as const,
    targets: [] as string[],
    startsAt: null,
    endsAt: null,
  };

  it('accepts a valid percent coupon', () => {
    expect(couponRuleError(rules)).toBeNull();
  });

  it('rejects inconsistent rules', () => {
    expect(couponRuleError({ ...rules, value: 95 })).toMatch(/porcentaje/);
    expect(couponRuleError({ ...rules, kind: 'FREE_SHIPPING', value: 5 })).toMatch(/envío gratis/);
    expect(couponRuleError({ ...rules, kind: 'FIXED', value: 500, maxDiscountCents: 100 })).toMatch(/tope/);
    expect(couponRuleError({ ...rules, buyQuantity: 2 })).toMatch(/Compra X/);
    expect(couponRuleError({ ...rules, scope: 'CATEGORY' })).toMatch(/Elige/);
    expect(
      couponRuleError({ ...rules, startsAt: new Date('2026-02-01'), endsAt: new Date('2026-01-01') }),
    ).toMatch(/fecha de fin/);
  });
});
