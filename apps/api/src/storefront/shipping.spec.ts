import { carrierQuotes, quoteShipping, type ShippingRules, shippingOptions } from './shipping';

const rules: ShippingRules = {
  deliveryEnabled: true,
  shippingLimaCents: 1000,
  shippingProvinceCents: 2000,
  freeShippingFromCents: 20000,
  deliveryDaysLima: '1 a 2 días hábiles',
  deliveryDaysProvince: '3 a 5 días hábiles',
  pickupEnabled: true,
  pickupAddress: 'Av. Larco 123, Miraflores',
  shippingOriginUbigeo: null,
  carrierRates: null,
};

const couriers: ShippingRules = {
  ...rules,
  shippingOriginUbigeo: '150132',
  carrierRates: { olva: [900, 1200, 1600, 2200, 2800], shalom: [800, 1000, 1400, 1800, 2400] },
};

describe('carrierQuotes', () => {
  it('prices by distance from the origin district', () => {
    expect(carrierQuotes(couriers, '150122').map((q) => q.cents)).toEqual([900, 800]);
    expect(carrierQuotes(couriers, '040101').map((q) => q.cents)).toEqual([2200, 1800]);
    expect(carrierQuotes(couriers, '160101').map((q) => q.cents)).toEqual([2800, 2400]);
  });

  it('ignores malformed rates and unknown districts', () => {
    expect(carrierQuotes({ ...couriers, carrierRates: { olva: [1, 2] } }, '150122')).toEqual([]);
    expect(carrierQuotes(couriers, '999999')).toEqual([]);
    expect(carrierQuotes({ ...couriers, shippingOriginUbigeo: null }, '150122')).toEqual([]);
  });

  it('offers couriers from the lowest tier and needs the district to quote', () => {
    expect(shippingOptions(couriers).filter((o) => o.byDistance)).toMatchObject([
      { mode: 'OLVA', cents: 900 },
      { mode: 'SHALOM', cents: 800 },
    ]);
    expect(quoteShipping(couriers, 'OLVA', 5000)).toBeNull();
    expect(quoteShipping(couriers, 'OLVA', 5000, false, '160101')).toMatchObject({ cents: 2800 });
    expect(quoteShipping(couriers, 'SHALOM', 20000, false, '160101')).toMatchObject({ cents: 0, free: true });
  });
});

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
