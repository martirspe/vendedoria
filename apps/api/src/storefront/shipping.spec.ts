import { quoteShipping, type ShippingRules, shippingOptions } from './shipping';

const rules: ShippingRules = {
  deliveryEnabled: true,
  shippingLimaCents: 1000,
  shippingProvinceCents: 2000,
  freeShippingFromCents: 20000,
  deliveryDaysLima: '1 a 2 días hábiles',
  deliveryDaysProvince: '3 a 5 días hábiles',
  pickupEnabled: true,
  pickupAddress: 'Av. Larco 123, Miraflores',
};

describe('shippingOptions', () => {
  it('lists only configured modes', () => {
    expect(shippingOptions(rules).map((o) => o.mode)).toEqual(['LIMA', 'PROVINCE', 'PICKUP']);
    expect(
      shippingOptions({ ...rules, shippingProvinceCents: null, pickupAddress: null }).map((o) => o.mode),
    ).toEqual(['LIMA']);
    expect(shippingOptions({ ...rules, deliveryEnabled: false }).map((o) => o.mode)).toEqual(['PICKUP']);
  });
});

describe('quoteShipping', () => {
  it('charges the base price under the threshold', () => {
    expect(quoteShipping(rules, 'LIMA', 5000)).toMatchObject({ cents: 1000, free: false });
    expect(quoteShipping(rules, 'PROVINCE', 5000)).toMatchObject({ cents: 2000, free: false });
  });

  it('is free from the threshold or with a free shipping coupon', () => {
    expect(quoteShipping(rules, 'LIMA', 20000)).toMatchObject({ cents: 0, free: true });
    expect(quoteShipping(rules, 'PROVINCE', 100, true)).toMatchObject({ cents: 0, free: true });
  });

  it('never charges pickup and rejects unavailable modes', () => {
    expect(quoteShipping(rules, 'PICKUP', 100)).toMatchObject({ cents: 0, free: false });
    expect(quoteShipping({ ...rules, pickupEnabled: false }, 'PICKUP', 100)).toBeNull();
  });
});
