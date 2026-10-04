import type { UbigeoDistrict } from '@vendedoria/contracts';
import { quoteShipping, ShippingCharge, ShippingRules, shippingOptions } from '../storefront/shipping';
import { UBIGEO_DISTRICTS } from '../ubigeo/ubigeo';
import { normalizeText } from './conversation-context';

/** How the order's delivery is settled before the payment link. */
export type DeliveryPlan =
  /** The business configured no delivery mode: no shipping is charged, delivery is coordinated in the chat. */
  | { kind: 'none' }
  | { kind: 'quote'; charge: ShippingCharge; place: UbigeoDistrict | null; address: string | null; pickupAddress: string | null }
  /** The district is still needed; `candidates` lists same-name districts when the buyer's was ambiguous. */
  | { kind: 'ask'; pickupAddress: string | null; candidates: UbigeoDistrict[] };

const MAX_CANDIDATES = 5;
const MAX_ADDRESS_CHARS = 240;

const words = (text: string) =>
  ` ${normalizeText(text)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;

const DISTRICT_NAMES = UBIGEO_DISTRICTS.map((district) => ({
  district,
  name: words(district.district),
  province: words(district.province),
  department: words(district.department),
}));

export function wantsPickup(text: string): boolean {
  return /\b(recojo|recoger|recogerlo|recogerla|recogerlos|paso a recoger|paso por|retiro|retirar|retirarlo|en tienda)\b/.test(
    normalizeText(text),
  );
}

/**
 * The INEI district the buyer named. Longer names win over names they contain ("San Juan de
 * Lurigancho" over "San Juan"), and a province or department in the rest of the message picks
 * among same-name districts ("Miraflores, Arequipa"). `ignore` removes words that are not a
 * place, such as the product name.
 */
export function matchDistrict(
  text: string,
  ignore: string[] = [],
): { district: UbigeoDistrict | null; candidates: UbigeoDistrict[] } {
  let haystack = words(text);
  for (const phrase of ignore) {
    const normalized = words(phrase).trim();
    if (normalized) haystack = haystack.split(` ${normalized} `).join(' ');
  }
  const aliased = withDistrictAliases(haystack);
  if (aliased !== haystack) {
    const literal = bestDistrict(haystack);
    if (literal.located) return literal.match;
    return bestDistrict(aliased).match;
  }
  return bestDistrict(haystack).match;
}

/** How Lima buyers name their district: "Surco" is Santiago de Surco, not Surco in Huarochirí. */
const DISTRICT_ALIASES: Array<[string, string]> = [
  ['surco', 'santiago de surco'],
  ['sjl', 'san juan de lurigancho'],
  ['sjm', 'san juan de miraflores'],
  ['smp', 'san martin de porres'],
  ['ves', 'villa el salvador'],
  ['vmt', 'villa maria del triunfo'],
  ['magdalena', 'magdalena del mar'],
];

function withDistrictAliases(haystack: string): string {
  return DISTRICT_ALIASES.reduce(
    (text, [short, full]) =>
      text.split(` ${full} `).join(` ${short} `).split(` ${short} `).join(` ${full} `),
    haystack,
  );
}

/** `located`: the buyer also named the province or department of the district found. */
function bestDistrict(haystack: string): {
  match: { district: UbigeoDistrict | null; candidates: UbigeoDistrict[] };
  located: boolean;
} {
  const hits = DISTRICT_NAMES.filter((entry) => haystack.includes(entry.name));
  const longest = hits.filter(
    (entry) => !hits.some((other) => other.name.length > entry.name.length && other.name.includes(entry.name)),
  );
  if (!longest.length) return { match: { district: null, candidates: [] }, located: false };

  const scored = longest.map((entry) => {
    const rest = haystack.replace(entry.name, ' ');
    const score = (rest.includes(entry.province) ? 2 : 0) + (rest.includes(entry.department) ? 1 : 0);
    return { entry, score };
  });
  const best = Math.max(...scored.map((item) => item.score));
  const top = scored.filter((item) => item.score === best).map((item) => item.entry.district);
  return {
    match:
      top.length === 1
        ? { district: top[0], candidates: [] }
        : { district: null, candidates: top.slice(0, MAX_CANDIDATES) },
    located: best > 0,
  };
}

/**
 * Settles delivery from the business's real shipping settings and the buyer's message. Never
 * invents a rate: home delivery is quoted only for a district the buyer named, with the
 * cheapest configured courier, and free shipping thresholds apply to the order subtotal.
 */
export function planDelivery(params: {
  rules: ShippingRules | null;
  text: string;
  subtotalCents: number;
  ignore?: string[];
}): DeliveryPlan {
  const { rules } = params;
  const options = rules ? shippingOptions(rules) : [];
  if (!rules || !options.length) return { kind: 'none' };

  const pickup = options.find((option) => option.mode === 'PICKUP');
  const couriers = options.filter((option) => option.mode !== 'PICKUP');
  const pickupAddress = pickup ? rules.pickupAddress : null;
  const pickupQuote = () => {
    const charge = quoteShipping(rules, 'PICKUP', params.subtotalCents);
    return charge
      ? ({ kind: 'quote', charge, place: null, address: null, pickupAddress } as const)
      : null;
  };

  if (!couriers.length) {
    return pickupQuote() ?? { kind: 'none' };
  }
  if (pickup && wantsPickup(params.text)) {
    const quote = pickupQuote();
    if (quote) return quote;
  }

  const { district, candidates } = matchDistrict(params.text, params.ignore);
  if (!district) {
    return { kind: 'ask', pickupAddress, candidates };
  }
  const charges = couriers
    .map((option) => quoteShipping(rules, option.mode, params.subtotalCents, false, district.code))
    .filter((charge): charge is ShippingCharge => Boolean(charge))
    .sort((a, b) => a.cents - b.cents);
  if (!charges.length) {
    return { kind: 'ask', pickupAddress, candidates: [] };
  }
  const address = /\d/.test(params.text) ? params.text.trim().slice(0, MAX_ADDRESS_CHARS) : null;
  return { kind: 'quote', charge: charges[0], place: district, address, pickupAddress };
}
