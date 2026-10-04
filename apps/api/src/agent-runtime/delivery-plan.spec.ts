import type { ShippingRules } from '../storefront/shipping';
import { matchDistrict, planDelivery, wantsPickup } from './delivery-plan';

const OLVA = [900, 1200, 1600, 2200, 2800];
const SHALOM = [800, 1300, 1500, 2000, 2600];

function rules(overrides: Partial<ShippingRules> = {}): ShippingRules {
  return {
    deliveryEnabled: true,
    freeShippingFromCents: null,
    pickupEnabled: false,
    pickupAddress: null,
    shippingOriginUbigeo: '150122',
    carrierRates: { olva: OLVA, shalom: SHALOM },
    ...overrides,
  };
}

describe('matchDistrict', () => {
  it('prefers the longest district name', () => {
    expect(matchDistrict('vivo en San Juan de Lurigancho').district?.code).toBe('150132');
  });

  it('uses the province to pick among same-name districts', () => {
    expect(matchDistrict('Miraflores, Lima').district?.code).toBe('150122');
    expect(matchDistrict('miraflores arequipa').district?.code).toBe('040110');
  });

  it('returns the candidates when the name is ambiguous', () => {
    const result = matchDistrict('Miraflores');
    expect(result.district).toBeNull();
    expect(result.candidates.map((place) => place.code)).toEqual(
      expect.arrayContaining(['150122', '040110']),
    );
  });

  it('reads the short names Lima buyers use, unless they name another province', () => {
    const surco = matchDistrict('surco').district;
    expect([surco?.district, surco?.province]).toEqual(['Santiago de Surco', 'Lima']);
    expect(matchDistrict('Santiago de Surco').district?.district).toBe('Santiago de Surco');
    expect(matchDistrict('vivo en sjl').district?.code).toBe('150132');
    expect(matchDistrict('Surco, Huarochirí').district?.province).toBe('Huarochirí');
  });

  it('ignores words that are not a place', () => {
    expect(matchDistrict('quiero el perfume Paracas', ['Paracas']).district).toBeNull();
  });

  it('finds nothing in a message without a district', () => {
    expect(matchDistrict('¿cuánto demora?')).toEqual({ district: null, candidates: [] });
  });
});

describe('wantsPickup', () => {
  it('detects pickup wording', () => {
    expect(wantsPickup('Paso a recoger mañana')).toBe(true);
    expect(wantsPickup('A Miraflores, por favor')).toBe(false);
  });
});

describe('planDelivery', () => {
  it('charges nothing when the business configured no delivery mode', () => {
    expect(planDelivery({ rules: null, text: 'Miraflores', subtotalCents: 5000 })).toEqual({ kind: 'none' });
    expect(
      planDelivery({ rules: rules({ deliveryEnabled: false }), text: 'Miraflores', subtotalCents: 5000 }),
    ).toEqual({ kind: 'none' });
  });

  it('asks for the district before quoting a courier', () => {
    const plan = planDelivery({ rules: rules(), text: 'lo quiero', subtotalCents: 5000 });
    expect(plan).toEqual({ kind: 'ask', pickupAddress: null, candidates: [] });
  });

  it('quotes the cheapest configured courier for the named district', () => {
    const plan = planDelivery({ rules: rules(), text: 'San Juan de Lurigancho', subtotalCents: 5000 });
    expect(plan.kind).toBe('quote');
    if (plan.kind !== 'quote') return;
    expect(plan.charge).toEqual({ mode: 'SHALOM', label: 'Shalom', cents: 800, free: false });
    expect(plan.place?.code).toBe('150132');
    expect(plan.address).toBeNull();
  });

  it('applies the free shipping threshold to the subtotal', () => {
    const plan = planDelivery({
      rules: rules({ freeShippingFromCents: 10000 }),
      text: 'Miraflores, Lima',
      subtotalCents: 12000,
    });
    expect(plan.kind === 'quote' && plan.charge).toMatchObject({ cents: 0, free: true });
  });

  it('keeps the message as address when it has a street number', () => {
    const plan = planDelivery({ rules: rules(), text: 'Av. Larco 123, Miraflores, Lima', subtotalCents: 5000 });
    expect(plan.kind === 'quote' && plan.address).toBe('Av. Larco 123, Miraflores, Lima');
  });

  it('settles pickup when the buyer asks for it or it is the only mode', () => {
    const withPickup = rules({ pickupEnabled: true, pickupAddress: 'Av. Larco 123' });
    expect(planDelivery({ rules: withPickup, text: 'paso a recoger', subtotalCents: 5000 })).toMatchObject({
      kind: 'quote',
      charge: { mode: 'PICKUP', cents: 0 },
      pickupAddress: 'Av. Larco 123',
    });
    const onlyPickup = rules({ deliveryEnabled: false, pickupEnabled: true, pickupAddress: 'Av. Larco 123' });
    expect(planDelivery({ rules: onlyPickup, text: 'lo quiero', subtotalCents: 5000 })).toMatchObject({
      kind: 'quote',
      charge: { mode: 'PICKUP' },
    });
  });
});
