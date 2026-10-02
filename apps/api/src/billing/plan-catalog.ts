import { PlanTier } from '@prisma/client';

export type PlanDefinition = {
  id: PlanTier;
  name: string;
  priceLabel: string;
  conversationQuota: number | null;
  productQuota: number | null;
  highlights: string[];
};

export const PLAN_CATALOG: PlanDefinition[] = [
  {
    id: 'FREE',
    name: 'Free',
    priceLabel: 'S/ 0',
    conversationQuota: 100,
    productQuota: 20,
    highlights: [
      'Hasta 100 conversaciones / mes',
      'Hasta 20 productos',
      'WhatsApp + playground',
      'Pagos comprador (flujo B) incluidos',
    ],
  },
  {
    id: 'STARTER',
    name: 'Starter',
    priceLabel: 'S/ 79 / mes',
    conversationQuota: 500,
    productQuota: 100,
    highlights: [
      'Hasta 500 conversaciones / mes',
      'Hasta 100 productos',
      'Prioridad en soporte setup',
    ],
  },
  {
    id: 'PRO',
    name: 'Pro',
    priceLabel: 'S/ 199 / mes',
    conversationQuota: 2000,
    productQuota: 500,
    highlights: [
      'Hasta 2 000 conversaciones / mes',
      'Hasta 500 productos',
      'Métricas y handoff avanzado',
    ],
  },
  {
    id: 'BUSINESS',
    name: 'Business',
    priceLabel: 'A medida',
    conversationQuota: null,
    productQuota: null,
    highlights: [
      'Cuotas altas / custom',
      'SLA y onboarding asistido',
      'Múltiples marcas (roadmap)',
    ],
  },
];

export function getPlanDefinition(tier: PlanTier): PlanDefinition {
  return PLAN_CATALOG.find((plan) => plan.id === tier) ?? PLAN_CATALOG[0];
}
