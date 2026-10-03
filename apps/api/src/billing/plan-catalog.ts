import { PlanTier } from '@prisma/client';

export type PlanDefinition = {
  id: PlanTier;
  name: string;
  priceLabel: string;
  /** Monthly price in PEN cents; null when it is quoted by the team. */
  priceCents: number | null;
  conversationQuota: number | null;
  productQuota: number | null;
  highlights: string[];
};

/** Days granted by each plan payment. */
export const PLAN_PERIOD_DAYS = 30;
export const PLAN_CURRENCY = 'PEN';

export const PLAN_CATALOG: PlanDefinition[] = [
  {
    id: 'FREE',
    name: 'Free',
    priceLabel: 'S/ 0',
    priceCents: 0,
    conversationQuota: 100,
    productQuota: 20,
    highlights: [
      'Hasta 100 conversaciones / mes',
      'Hasta 20 productos',
      'WhatsApp y Probar vendedor',
      'Cobros a tus compradores incluidos',
    ],
  },
  {
    id: 'STARTER',
    name: 'Starter',
    priceLabel: 'S/ 79 / mes',
    priceCents: 7_900,
    conversationQuota: 500,
    productQuota: 100,
    highlights: [
      'Hasta 500 conversaciones / mes',
      'Hasta 100 productos',
      'Soporte prioritario para la configuración',
    ],
  },
  {
    id: 'PRO',
    name: 'Pro',
    priceLabel: 'S/ 199 / mes',
    priceCents: 19_900,
    conversationQuota: 2000,
    productQuota: 500,
    highlights: [
      'Hasta 2 000 conversaciones / mes',
      'Hasta 500 productos',
      'Métricas y derivación a asesores avanzadas',
    ],
  },
  {
    id: 'BUSINESS',
    name: 'Business',
    priceLabel: 'A medida',
    priceCents: null,
    conversationQuota: null,
    productQuota: null,
    highlights: [
      'Límites a la medida de tu negocio',
      'Acuerdo de nivel de servicio y acompañamiento inicial',
      'Múltiples marcas (próximamente)',
    ],
  },
];

export function getPlanDefinition(tier: PlanTier): PlanDefinition {
  return PLAN_CATALOG.find((plan) => plan.id === tier) ?? PLAN_CATALOG[0];
}

/** Paid plans bought online (Business is quoted by the team). */
export function isPurchasable(plan: PlanDefinition): plan is PlanDefinition & { priceCents: number } {
  return plan.priceCents !== null && plan.priceCents > 0;
}

/** The plan whose limits apply now: an expired paid period falls back to FREE. */
export function effectivePlanTier(
  tenant: { planTier: PlanTier; planExpiresAt: Date | null },
  now = new Date(),
): PlanTier {
  return tenant.planExpiresAt && tenant.planExpiresAt <= now ? 'FREE' : tenant.planTier;
}
