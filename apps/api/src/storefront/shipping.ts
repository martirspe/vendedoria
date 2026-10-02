import type { ShippingMode, ShippingOption } from '@vendedoria/contracts';

export type ShippingRules = {
  deliveryEnabled: boolean;
  shippingLimaCents: number | null;
  shippingProvinceCents: number | null;
  freeShippingFromCents: number | null;
  deliveryDaysLima: string | null;
  deliveryDaysProvince: string | null;
  pickupEnabled: boolean;
  pickupAddress: string | null;
};

export type ShippingQuote = {
  mode: ShippingMode;
  label: string;
  cents: number;
  free: boolean;
};

/** Delivery modes the store offers, with their base price. */
export function shippingOptions(rules: ShippingRules): ShippingOption[] {
  const options: ShippingOption[] = [];
  if (rules.deliveryEnabled && rules.shippingLimaCents !== null) {
    options.push({
      mode: 'LIMA',
      label: 'Envío a Lima Metropolitana y Callao',
      cents: rules.shippingLimaCents,
      eta: rules.deliveryDaysLima,
    });
  }
  if (rules.deliveryEnabled && rules.shippingProvinceCents !== null) {
    options.push({
      mode: 'PROVINCE',
      label: 'Envío a provincias',
      cents: rules.shippingProvinceCents,
      eta: rules.deliveryDaysProvince,
    });
  }
  if (rules.pickupEnabled && rules.pickupAddress) {
    options.push({
      mode: 'PICKUP',
      label: 'Recojo en tienda',
      cents: 0,
      eta: rules.pickupAddress,
    });
  }
  return options;
}

/**
 * Prices the chosen mode. `subtotalCents` is the amount after discounts, so a coupon
 * cannot be used to reach the free shipping threshold artificially.
 */
export function quoteShipping(
  rules: ShippingRules,
  mode: ShippingMode,
  subtotalCents: number,
  couponFreeShipping = false,
): ShippingQuote | null {
  const option = shippingOptions(rules).find((o) => o.mode === mode);
  if (!option) return null;
  if (option.mode === 'PICKUP') {
    return { mode, label: option.label, cents: 0, free: false };
  }
  const reachesThreshold =
    rules.freeShippingFromCents !== null && subtotalCents >= rules.freeShippingFromCents;
  const free = couponFreeShipping || reachesThreshold || option.cents === 0;
  return { mode, label: option.label, cents: free ? 0 : option.cents, free };
}
