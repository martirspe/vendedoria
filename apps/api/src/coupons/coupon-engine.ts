import type { CouponKind, CouponScope } from '@prisma/client';

/** Mercado Pago rejects charges below S/ 1.00, so a coupon never takes the cart under it. */
export const MIN_CHARGE_CENTS = 100;
export const COUPON_CODE_PATTERN = /^[A-Z0-9_-]{3,30}$/;

export type CouponRule = {
  kind: CouponKind;
  value: number;
  maxDiscountCents: number | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  maxApplications: number | null;
  minSubtotalCents: number;
  minItems: number;
  scope: CouponScope;
  targets: string[];
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
};

export type CouponLine = {
  handle: string;
  categories: string[];
  brand: string | null;
  unitCents: number;
  quantity: number;
};

export type CouponResult =
  | { ok: true; discountCents: number; eligibleCents: number; freeShipping: boolean }
  | { ok: false; reason: string };

export const normalizeCouponCode = (value: string) => value.trim().toUpperCase();

const soles = (cents: number) => `S/ ${(cents / 100).toFixed(2)}`;

export function lineIsEligible(
  coupon: Pick<CouponRule, 'scope' | 'targets'>,
  line: CouponLine,
): boolean {
  switch (coupon.scope) {
    case 'CATEGORY':
      return line.categories.some((category) => coupon.targets.includes(category));
    case 'BRAND':
      return line.brand !== null && coupon.targets.includes(line.brand);
    case 'PRODUCTS':
      return coupon.targets.includes(line.handle);
    default:
      return true;
  }
}

export function evaluateCoupon(
  coupon: CouponRule,
  lines: CouponLine[],
  now = new Date(),
): CouponResult {
  if (!coupon.isActive) return { ok: false, reason: 'Este cupón no está disponible.' };
  if (coupon.startsAt && now < coupon.startsAt) {
    return { ok: false, reason: 'Este cupón aún no está vigente.' };
  }
  if (coupon.endsAt && now >= coupon.endsAt) {
    return { ok: false, reason: 'Este cupón ya venció.' };
  }

  const hits = lines.filter((line) => lineIsEligible(coupon, line));
  if (!hits.length) {
    return { ok: false, reason: 'Este cupón no aplica a los productos de tu carrito.' };
  }

  const subtotal = lines.reduce((sum, l) => sum + l.unitCents * l.quantity, 0);
  const eligibleCents = hits.reduce((sum, l) => sum + l.unitCents * l.quantity, 0);
  const units = hits.reduce((sum, l) => sum + l.quantity, 0);

  if (eligibleCents < coupon.minSubtotalCents) {
    return {
      ok: false,
      reason: `Agrega ${soles(coupon.minSubtotalCents - eligibleCents)} más en productos participantes para usar este cupón.`,
    };
  }
  if (units < coupon.minItems) {
    return {
      ok: false,
      reason: `Este cupón requiere al menos ${coupon.minItems} productos participantes.`,
    };
  }
  if (coupon.kind === 'FREE_SHIPPING') {
    return { ok: true, discountCents: 0, eligibleCents, freeShipping: true };
  }

  let discount =
    coupon.kind === 'PERCENT'
      ? Math.floor((eligibleCents * coupon.value) / 100)
      : coupon.value;

  if (coupon.kind === 'BUY_X_GET_Y') {
    const buy = coupon.buyQuantity ?? 1;
    const get = coupon.getQuantity ?? 1;
    const size = buy + get;
    if (units < size) {
      const missing = size - units;
      return {
        ok: false,
        reason: `Agrega ${missing} ${missing === 1 ? 'producto participante' : 'productos participantes'} más para activar esta promoción.`,
      };
    }
    const groups = Math.min(
      Math.floor(units / size),
      coupon.maxApplications ?? Number.POSITIVE_INFINITY,
    );
    const cheapestFirst = hits
      .flatMap((l) => Array<number>(l.quantity).fill(l.unitCents))
      .sort((a, b) => a - b);
    discount = cheapestFirst
      .slice(0, groups * get)
      .reduce((sum, price) => sum + Math.floor((price * coupon.value) / 100), 0);
  }

  if (coupon.maxDiscountCents !== null) {
    discount = Math.min(discount, coupon.maxDiscountCents);
  }
  discount = Math.min(discount, eligibleCents, subtotal - MIN_CHARGE_CENTS);
  if (discount <= 0) {
    return { ok: false, reason: 'Este cupón no aplica a los productos de tu carrito.' };
  }
  return { ok: true, discountCents: discount, eligibleCents, freeShipping: false };
}

/** Business rules shared by create and update. Returns a Spanish message or null. */
export function couponRuleError(c: {
  kind: CouponKind;
  value: number;
  maxDiscountCents: number | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  maxApplications: number | null;
  scope: CouponScope;
  targets: string[];
  startsAt: Date | null;
  endsAt: Date | null;
}): string | null {
  if (c.kind === 'PERCENT' && (c.value < 1 || c.value > 90)) {
    return 'El porcentaje debe estar entre 1 y 90.';
  }
  if (c.kind === 'FIXED' && c.value < 1) return 'Indica el monto del descuento.';
  if (c.kind === 'FREE_SHIPPING' && c.value !== 0) return 'El envío gratis no lleva monto.';
  if (c.kind === 'BUY_X_GET_Y') {
    if (c.value < 1 || c.value > 100) {
      return 'El beneficio de las unidades de regalo debe estar entre 1 y 100 %.';
    }
    if (!c.buyQuantity || !c.getQuantity) {
      return 'Indica cuántas unidades paga y cuántas lleva con beneficio.';
    }
  } else if (c.buyQuantity !== null || c.getQuantity !== null || c.maxApplications !== null) {
    return 'Las cantidades solo aplican a «Compra X, lleva Y».';
  }
  if (c.kind !== 'PERCENT' && c.kind !== 'BUY_X_GET_Y' && c.maxDiscountCents !== null) {
    return 'El tope solo aplica a porcentajes y a «Compra X, lleva Y».';
  }
  if (c.scope === 'ALL' ? c.targets.length > 0 : c.targets.length === 0) {
    return 'Elige a qué productos aplica.';
  }
  if (c.startsAt && c.endsAt && c.endsAt <= c.startsAt) {
    return 'La fecha de fin debe ser posterior al inicio.';
  }
  return null;
}
