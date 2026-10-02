import type { Prisma } from '@prisma/client';
import type { ShippingMode, ShippingOption, ShippingQuote } from '@vendedoria/contracts';
import { distanceKm, findUbigeo } from '../ubigeo/ubigeo';

export type ShippingRules = {
  deliveryEnabled: boolean;
  freeShippingFromCents: number | null;
  pickupEnabled: boolean;
  pickupAddress: string | null;
  shippingOriginUbigeo: string | null;
  carrierRates: Prisma.JsonValue | null;
};

export type ShippingCharge = {
  mode: ShippingMode;
  label: string;
  cents: number;
  free: boolean;
};

export type CarrierMode = 'OLVA' | 'SHALOM';

/** Distance tiers in km: ≤20, ≤100, ≤400, ≤900, farther or unknown. */
export const CARRIER_TIER_LIMITS_KM = [20, 100, 400, 900] as const;
export const CARRIER_TIERS = CARRIER_TIER_LIMITS_KM.length + 1;
export const MAX_CARRIER_RATE_CENTS = 100_000;

const CARRIERS: Record<CarrierMode, { key: 'olva' | 'shalom'; label: string }> = {
  OLVA: { key: 'olva', label: 'Olva Courier' },
  SHALOM: { key: 'shalom', label: 'Shalom' },
};

/** Valid tier arrays per carrier; anything malformed counts as not configured. */
export function carrierTiers(rules: Pick<ShippingRules, 'shippingOriginUbigeo' | 'carrierRates'>) {
  const tiers: Partial<Record<CarrierMode, number[]>> = {};
  if (!rules.shippingOriginUbigeo || !findUbigeo(rules.shippingOriginUbigeo)) return tiers;
  const raw = rules.carrierRates as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return tiers;
  for (const mode of Object.keys(CARRIERS) as CarrierMode[]) {
    const value = raw[CARRIERS[mode].key];
    if (
      Array.isArray(value) &&
      value.length === CARRIER_TIERS &&
      value.every((c) => Number.isSafeInteger(c) && c >= 0 && c <= MAX_CARRIER_RATE_CENTS)
    ) {
      tiers[mode] = value as number[];
    }
  }
  return tiers;
}

/** Delivery modes the store offers, with their base price. */
export function shippingOptions(rules: ShippingRules): ShippingOption[] {
  const options: ShippingOption[] = [];
  if (rules.deliveryEnabled) {
    for (const [mode, tiers] of Object.entries(carrierTiers(rules)) as [CarrierMode, number[]][]) {
      options.push({
        mode,
        label: CARRIERS[mode].label,
        cents: Math.min(...tiers),
        eta: null,
        byDistance: true,
      });
    }
  }
  if (rules.pickupEnabled && rules.pickupAddress) {
    options.push({
      mode: 'PICKUP',
      label: 'Recojo en tienda',
      cents: 0,
      eta: rules.pickupAddress,
      byDistance: false,
    });
  }
  return options;
}

/** Reference courier rates for a district (base price, before free shipping). */
export function carrierQuotes(rules: ShippingRules, ubigeo: string): ShippingQuote[] {
  if (!rules.deliveryEnabled || !rules.shippingOriginUbigeo || !findUbigeo(ubigeo)) return [];
  const distance = distanceKm(rules.shippingOriginUbigeo, ubigeo);
  const index = distance === null ? -1 : CARRIER_TIER_LIMITS_KM.findIndex((limit) => distance <= limit);
  const tier = index === -1 ? CARRIER_TIERS - 1 : index;
  return (Object.entries(carrierTiers(rules)) as [CarrierMode, number[]][]).map(([mode, tiers]) => ({
    mode,
    label: CARRIERS[mode].label,
    cents: tiers[tier],
    distanceKm: distance,
  }));
}

/**
 * Prices the chosen mode. `subtotalCents` is the amount after discounts, so a coupon
 * cannot be used to reach the free shipping threshold artificially. Couriers need the
 * destination district.
 */
export function quoteShipping(
  rules: ShippingRules,
  mode: ShippingMode,
  subtotalCents: number,
  couponFreeShipping = false,
  ubigeo?: string,
): ShippingCharge | null {
  const option = shippingOptions(rules).find((o) => o.mode === mode);
  if (!option) return null;
  if (option.mode === 'PICKUP') {
    return { mode, label: option.label, cents: 0, free: false };
  }
  const quote = ubigeo ? carrierQuotes(rules, ubigeo).find((q) => q.mode === mode) : undefined;
  if (!quote) return null;
  const cents = quote.cents;
  const reachesThreshold =
    rules.freeShippingFromCents !== null && subtotalCents >= rules.freeShippingFromCents;
  const free = couponFreeShipping || reachesThreshold || cents === 0;
  return { mode, label: option.label, cents: free ? 0 : cents, free };
}
