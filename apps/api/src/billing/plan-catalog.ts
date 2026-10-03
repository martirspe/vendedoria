import { PlanTier } from '@prisma/client';

/** Limits of a plan; null means no fixed limit. */
export type PlanLimits = {
  /** New conversations the sales agent can start per calendar month. */
  conversationQuota: number | null;
  productQuota: number | null;
  /** Coupons active at the same time in the store. */
  couponQuota: number | null;
  /** The store shows "Hecho con VendedorIA". */
  platformBadge: boolean;
};

export type PlanDefinition = PlanLimits & {
  id: PlanTier;
  name: string;
  priceLabel: string;
  /** Monthly price in PEN cents; null when it is quoted by the team. */
  priceCents: number | null;
  /** Who the plan is for, one line. */
  description: string;
  /** Extra line under the price (e.g. the trial). */
  note: string | null;
  highlights: string[];
};

/** TRIAL: Starter with the trial limits. EXPIRED: trial or paid period ended without renewal. */
export type PlanStatus = 'TRIAL' | 'ACTIVE' | 'EXPIRED';

export type PlanState = PlanLimits & {
  plan: PlanDefinition;
  status: PlanStatus;
};

/** Days granted by each plan payment. */
export const PLAN_PERIOD_DAYS = 30;
/** Trial length; the database default of `Tenant.planExpiresAt` uses the same value. */
export const PLAN_TRIAL_DAYS = 30;
export const PLAN_CURRENCY = 'PEN';

/**
 * Trial limits. 100 conversations of about 8 agent replies stay inside the 1 000 service
 * messages Meta gives each WhatsApp number per month, so the trial costs the business nothing.
 */
export const TRIAL_LIMITS: PlanLimits = {
  conversationQuota: 100,
  productQuota: 20,
  couponQuota: 3,
  platformBadge: true,
};

/** Features every plan has; shown once instead of repeating them in each card. */
export const INCLUDED_IN_ALL_PLANS = [
  'Vendedor IA que responde tu WhatsApp al instante',
  'Tienda web con tu propio enlace',
  'Cobros con tarjeta y Yape en tu tienda',
  'Pedidos, mensajes y métricas en un solo lugar',
  'Probar vendedor para ensayar sus respuestas',
];

/**
 * How quotas and costs work. The WhatsApp line follows Meta's Peru rate card effective
 * 2026-10-01 (billed to the business's own WhatsApp Business account): update it when Meta
 * changes its rates.
 */
export const PLAN_NOTES = [
  'Un chat nuevo es una persona que te escribe por primera vez. Si esa persona vuelve a escribirte, no cuenta otra vez.',
  'Meta cobra los mensajes de WhatsApp aparte, en tu cuenta de WhatsApp Business: cada número tiene 1 000 respuestas gratis al mes y luego paga unos S/ 0,10 por respuesta. Un chat de venta usa entre 6 y 10 respuestas.',
  'El dinero de tus ventas llega a tu cuenta de Mercado Pago. VendedorIA no cobra comisión por venta.',
];

export const PLAN_CATALOG: PlanDefinition[] = [
  {
    id: 'STARTER',
    name: 'Starter',
    priceLabel: 'S/ 69 / mes',
    priceCents: 6_900,
    conversationQuota: 300,
    productQuota: 100,
    couponQuota: 3,
    platformBadge: true,
    description: 'Para empezar a vender por WhatsApp y en tu tienda web.',
    note: `Empieza con ${PLAN_TRIAL_DAYS} días gratis, sin tarjeta: 100 chats nuevos, 20 productos y 3 cupones.`,
    highlights: [
      '300 chats nuevos al mes',
      'Hasta 100 productos',
      '3 cupones activos a la vez',
      'Tu tienda muestra «Hecho con VendedorIA»',
    ],
  },
  {
    id: 'PRO',
    name: 'Pro',
    priceLabel: 'S/ 179 / mes',
    priceCents: 17_900,
    conversationQuota: 1200,
    productQuota: 500,
    couponQuota: 20,
    platformBadge: false,
    description: 'Para negocios que ya venden todos los días.',
    note: null,
    highlights: [
      '1 200 chats nuevos al mes',
      'Hasta 500 productos',
      '20 cupones activos a la vez',
      'Tu tienda solo con tu marca',
    ],
  },
  {
    id: 'BUSINESS',
    name: 'Business',
    priceLabel: 'S/ 449 / mes',
    priceCents: 44_900,
    conversationQuota: 4000,
    productQuota: 2000,
    couponQuota: null,
    platformBadge: false,
    description: 'Para negocios con muchos chats y un catálogo grande.',
    note: null,
    highlights: [
      '4 000 chats nuevos al mes',
      'Hasta 2 000 productos',
      'Cupones sin límite',
      'Tu tienda solo con tu marca',
      'Soporte prioritario',
    ],
  },
  {
    id: 'ENTERPRISE',
    name: 'A medida',
    priceLabel: 'Según tu volumen',
    priceCents: null,
    conversationQuota: null,
    productQuota: null,
    couponQuota: null,
    platformBadge: false,
    description: 'Para negocios que necesitan más de lo que incluye Business.',
    note: null,
    highlights: [
      'Más de 4 000 chats nuevos al mes',
      'Productos y cupones según tu negocio',
      'Tu tienda solo con tu marca',
      'Te ayudamos a configurar tu vendedor y tu tienda',
    ],
  },
];

export function getPlanDefinition(tier: PlanTier): PlanDefinition {
  return PLAN_CATALOG.find((plan) => plan.id === tier) ?? PLAN_CATALOG[0];
}

/** Paid plans bought online (the custom plan is quoted by the team). */
export function isPurchasable(plan: PlanDefinition): plan is PlanDefinition & { priceCents: number } {
  return plan.priceCents !== null && plan.priceCents > 0;
}

function limitsOf(source: PlanLimits): PlanLimits {
  return {
    conversationQuota: source.conversationQuota,
    productQuota: source.productQuota,
    couponQuota: source.couponQuota,
    platformBadge: source.platformBadge,
  };
}

/**
 * The plan and limits that apply now. There is no free plan: once the trial or the paid
 * period ends, new conversations and new products are blocked until the tenant pays.
 * Coupons already active and the store keep working.
 */
export function resolvePlanState(
  tenant: { planTier: PlanTier; planTrial: boolean; planExpiresAt: Date | null },
  now = new Date(),
): PlanState {
  const plan = getPlanDefinition(tenant.planTier);
  if (tenant.planExpiresAt && tenant.planExpiresAt <= now) {
    const base = tenant.planTrial ? TRIAL_LIMITS : plan;
    return {
      plan,
      status: 'EXPIRED',
      ...limitsOf(base),
      conversationQuota: 0,
      productQuota: 0,
      platformBadge: true,
    };
  }
  if (tenant.planTrial) {
    return { plan, status: 'TRIAL', ...limitsOf(TRIAL_LIMITS) };
  }
  return { plan, status: 'ACTIVE', ...limitsOf(plan) };
}
