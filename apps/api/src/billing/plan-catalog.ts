import { PlanTier } from '@prisma/client';

/**
 * Optional features turned on from Integraciones; each plan lists the ones it includes. The sales
 * agent is the core product: the web store is an add-on from Crece up.
 */
export type IntegrationKey = 'store' | 'custom_domain' | 'instagram' | 'tracking' | 'team';

/** Limits of a plan; null means no fixed limit. */
export type PlanLimits = {
  /** New conversations the sales agent can start per calendar month. */
  conversationQuota: number | null;
  /** Agent replies written with OpenAI per calendar month; past it the agent answers without AI. */
  aiReplyQuota: number | null;
  /** Texts and sections written with AI in the store editor per calendar month. */
  aiTextQuota: number | null;
  /** Images generated with AI in the store editor per calendar month. */
  aiImageQuota: number | null;
  productQuota: number | null;
  /** Coupons active at the same time in the store. */
  couponQuota: number | null;
  /** Console users, owner included. */
  seatQuota: number | null;
  /** The store shows "Hecho con VendedorIA". */
  platformBadge: boolean;
  integrations: IntegrationKey[];
};

export type PlanDefinition = PlanLimits & {
  id: PlanTier;
  name: string;
  priceLabel: string;
  /** Monthly price in PEN cents (IGV included); null when it is quoted by the team. */
  priceCents: number | null;
  /** Who the plan is for, one line. */
  description: string;
  /** Extra line under the price (e.g. the trial). */
  note: string | null;
  highlights: string[];
};

/** TRIAL: Crece with the trial limits. EXPIRED: trial or paid period ended without renewal. */
export type PlanStatus = 'TRIAL' | 'ACTIVE' | 'EXPIRED';

export type PlanState = PlanLimits & {
  plan: PlanDefinition;
  status: PlanStatus;
};

export type PrepayOption = {
  months: number;
  discountPercent: number;
  label: string;
};

export type ChatPackDefinition = {
  chats: number;
  priceCents: number;
};

/** Days granted by each paid month. */
export const PLAN_PERIOD_DAYS = 30;
/** Trial length; the database default of `Tenant.planExpiresAt` uses the same value. */
export const PLAN_TRIAL_DAYS = 14;
export const PLAN_CURRENCY = 'PEN';
/** Plan new businesses try; the database default of `Tenant.planTier` uses the same value. */
export const TRIAL_PLAN: PlanTier = 'GROW';

/**
 * AI replies included per new chat. A sales chat uses 6 to 10 replies; 15 covers long chats and
 * returning buyers. Cost reference (gpt-4o-mini, one call per reply, ~5 000 input and ~250 output
 * tokens, US$ 0.15 / 0.60 per million): under S/ 0.004 per reply, so the cap bounds the OpenAI
 * cost of every plan.
 */
export const AI_REPLIES_PER_CHAT = 15;

/*
 * Store editor AI has its own caps so writing the store never uses the agent's replies. Cost
 * reference: a text request (~1 500 tokens with gpt-4o-mini) is under S/ 0.003; a 1536×1024
 * image with gpt-image-1-mini at medium quality is about S/ 0.06, so at full use the image cap
 * stays under ~3 % of each plan price. Review the caps if `OPENAI_IMAGE_MODEL` changes.
 */

/**
 * Paying several months in advance (one payment, no automatic renewal). Discounts keep at least
 * ~30 % margin at full use of every plan after IGV, the Mercado Pago fee and the AI cost.
 */
export const PREPAY_OPTIONS: PrepayOption[] = [
  { months: 1, discountPercent: 0, label: 'Mensual' },
  { months: 3, discountPercent: 5, label: 'Trimestral' },
  { months: 6, discountPercent: 10, label: 'Semestral' },
  { months: 12, discountPercent: 17, label: 'Anual' },
];

/** Extra new chats for the current calendar month, each with its AI replies. */
export const CHAT_PACKS: ChatPackDefinition[] = [
  { chats: 100, priceCents: 1_500 },
  { chats: 500, priceCents: 6_500 },
  { chats: 1000, priceCents: 12_500 },
];

/**
 * Trial limits. 100 chats of about 8 agent replies stay inside the 1 000 service messages Meta
 * gives each WhatsApp number per month, so the trial costs the business nothing.
 */
export const TRIAL_LIMITS: PlanLimits = {
  conversationQuota: 100,
  aiReplyQuota: 100 * AI_REPLIES_PER_CHAT,
  aiTextQuota: 100,
  aiImageQuota: 10,
  productQuota: 20,
  couponQuota: 3,
  seatQuota: 2,
  platformBadge: true,
  integrations: ['store', 'instagram', 'custom_domain', 'team'],
};

/** Features every plan has; shown once instead of repeating them in each card. */
export const INCLUDED_IN_ALL_PLANS = [
  'Vendedor IA que responde tu WhatsApp e Instagram al instante',
  'Links de pago con tarjeta y Yape que tu vendedor envía en el chat',
  'Pedidos, mensajes y métricas en un solo lugar',
  'Sin contratos: pagas por mes o por adelantado con descuento',
];

/**
 * How quotas and costs work. The WhatsApp line follows Meta's Peru rate card effective
 * 2026-10-01 (billed to the business's own WhatsApp Business account): update it when Meta
 * changes its rates.
 */
export const PLAN_NOTES = [
  'Un chat nuevo es una persona que te escribe por primera vez. Si esa persona vuelve a escribirte, no cuenta otra vez.',
  'Las respuestas con IA son las que tu vendedor escribe con inteligencia artificial. Si llegas al máximo del mes, sigue respondiendo con respuestas básicas de tu catálogo hasta el mes siguiente o hasta que sumes chats extra.',
  'Los textos e imágenes con IA del editor de tu tienda tienen su propio límite mensual y no usan las respuestas de tu vendedor.',
  'Meta cobra los mensajes de WhatsApp aparte, en tu cuenta de WhatsApp Business: cada número tiene 1 000 respuestas gratis al mes y luego paga unos S/ 0,10 por respuesta. Un chat de venta usa entre 6 y 10 respuestas.',
  'El dinero de tus ventas llega a tu cuenta de Mercado Pago. VendedorIA no cobra comisión por venta.',
  'Los precios incluyen IGV.',
];

export const PLAN_CATALOG: PlanDefinition[] = [
  {
    id: 'START',
    name: 'Inicia',
    priceLabel: 'S/ 29 / mes',
    priceCents: 2_900,
    conversationQuota: 50,
    aiReplyQuota: 50 * AI_REPLIES_PER_CHAT,
    aiTextQuota: 0,
    aiImageQuota: 0,
    productQuota: 25,
    couponQuota: 0,
    seatQuota: 1,
    platformBadge: true,
    integrations: ['instagram'],
    description: 'Para empezar a vender por WhatsApp e Instagram con tu vendedor IA.',
    note: null,
    highlights: [
      '50 chats nuevos al mes',
      'Hasta 750 respuestas con IA al mes',
      'Hasta 25 productos en tu catálogo',
      '1 usuario',
      'Sin tienda web',
    ],
  },
  {
    id: 'GROW',
    name: 'Crece',
    priceLabel: 'S/ 79 / mes',
    priceCents: 7_900,
    conversationQuota: 400,
    aiReplyQuota: 400 * AI_REPLIES_PER_CHAT,
    aiTextQuota: 300,
    aiImageQuota: 30,
    productQuota: 100,
    couponQuota: 5,
    seatQuota: 2,
    platformBadge: false,
    integrations: ['store', 'instagram', 'custom_domain', 'team'],
    description: 'Para vender todos los días con tu tienda web, diseñada con IA en minutos.',
    note: `Empieza con ${PLAN_TRIAL_DAYS} días gratis, sin tarjeta: 100 chats nuevos, 20 productos y 3 cupones.`,
    highlights: [
      'Tienda web con cobros con tarjeta y Yape',
      'Diseña tu tienda con IA: 300 textos y 30 imágenes al mes',
      '400 chats nuevos al mes',
      'Hasta 6 000 respuestas con IA al mes',
      'Hasta 100 productos',
      '5 cupones activos a la vez',
      '2 usuarios',
      'Tu dominio propio (www.tumarca.pe)',
      'Tu tienda solo con tu marca',
    ],
  },
  {
    id: 'SCALE',
    name: 'Escala',
    priceLabel: 'S/ 199 / mes',
    priceCents: 19_900,
    conversationQuota: 1200,
    aiReplyQuota: 1200 * AI_REPLIES_PER_CHAT,
    aiTextQuota: 1000,
    aiImageQuota: 100,
    productQuota: 300,
    couponQuota: 20,
    seatQuota: 5,
    platformBadge: false,
    integrations: ['store', 'instagram', 'custom_domain', 'team', 'tracking'],
    description: 'Para negocios que invierten en anuncios y atienden en equipo.',
    note: null,
    highlights: [
      'Diseña tu tienda con IA: 1 000 textos y 100 imágenes al mes',
      '1 200 chats nuevos al mes',
      'Hasta 18 000 respuestas con IA al mes',
      'Hasta 300 productos',
      '20 cupones activos a la vez',
      '5 usuarios',
      'Tu dominio propio (www.tumarca.pe)',
      'Píxel de Meta y Google Analytics en tu tienda',
    ],
  },
  {
    id: 'LEAD',
    name: 'Lidera',
    priceLabel: 'S/ 549 / mes',
    priceCents: 54_900,
    conversationQuota: 4000,
    aiReplyQuota: 4000 * AI_REPLIES_PER_CHAT,
    aiTextQuota: 3000,
    aiImageQuota: 150,
    productQuota: 1000,
    couponQuota: null,
    seatQuota: 15,
    platformBadge: false,
    integrations: ['store', 'instagram', 'custom_domain', 'team', 'tracking'],
    description: 'Para negocios con mucho volumen de chats y un catálogo grande.',
    note: null,
    highlights: [
      'Diseña tu tienda con IA: 3 000 textos y 150 imágenes al mes',
      '4 000 chats nuevos al mes',
      'Hasta 60 000 respuestas con IA al mes',
      'Hasta 1 000 productos',
      'Cupones sin límite',
      '15 usuarios',
      'Tu dominio propio, píxel de Meta y Google Analytics',
      'Soporte prioritario',
    ],
  },
  {
    id: 'ENTERPRISE',
    name: 'A medida',
    priceLabel: 'Según tu volumen',
    priceCents: null,
    conversationQuota: null,
    aiReplyQuota: null,
    aiTextQuota: null,
    aiImageQuota: null,
    productQuota: null,
    couponQuota: null,
    seatQuota: null,
    platformBadge: false,
    integrations: ['store', 'instagram', 'custom_domain', 'team', 'tracking'],
    description: 'Para negocios que necesitan más de lo que incluye Lidera.',
    note: null,
    highlights: [
      'Más de 4 000 chats nuevos al mes',
      'Productos, cupones y usuarios según tu negocio',
      'Todas las integraciones',
      'Te ayudamos a configurar tu vendedor y tu tienda',
    ],
  },
];

export function getPlanDefinition(tier: PlanTier): PlanDefinition {
  return PLAN_CATALOG.find((plan) => plan.id === tier) ?? PLAN_CATALOG[1];
}

/** Paid plans bought online (the custom plan is quoted by the team). */
export function isPurchasable(plan: PlanDefinition): plan is PlanDefinition & { priceCents: number } {
  return plan.priceCents !== null && plan.priceCents > 0;
}

export function findPrepayOption(months: number): PrepayOption | undefined {
  return PREPAY_OPTIONS.find((option) => option.months === months);
}

export function findChatPack(chats: number): ChatPackDefinition | undefined {
  return CHAT_PACKS.find((pack) => pack.chats === chats);
}

/** Total of a prepaid period, rounded to whole soles. */
export function prepayTotalCents(monthlyCents: number, option: PrepayOption): number {
  const total = (monthlyCents * option.months * (100 - option.discountPercent)) / 100;
  return Math.round(total / 100) * 100;
}

/** Start of the calendar month quotas count from (server time, as the usage counters). */
export function currentPeriodStart(now = new Date()): Date {
  const start = new Date(now);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return start;
}

function limitsOf(source: PlanLimits): PlanLimits {
  return {
    conversationQuota: source.conversationQuota,
    aiReplyQuota: source.aiReplyQuota,
    aiTextQuota: source.aiTextQuota,
    aiImageQuota: source.aiImageQuota,
    productQuota: source.productQuota,
    couponQuota: source.couponQuota,
    seatQuota: source.seatQuota,
    platformBadge: source.platformBadge,
    integrations: [...source.integrations],
  };
}

/**
 * The plan and limits that apply now. There is no free plan: once the trial or the paid
 * period ends, new conversations, AI replies, new products and integrations (the web store
 * included) stop until the tenant pays. Current team members keep their access.
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
      aiReplyQuota: 0,
      aiTextQuota: 0,
      aiImageQuota: 0,
      productQuota: 0,
      platformBadge: true,
      integrations: [],
    };
  }
  if (tenant.planTrial) {
    return { plan, status: 'TRIAL', ...limitsOf(TRIAL_LIMITS) };
  }
  return { plan, status: 'ACTIVE', ...limitsOf(plan) };
}

export function planAllows(state: PlanState, key: IntegrationKey): boolean {
  return state.integrations.includes(key);
}

/** Cheapest purchasable plan that includes an integration, for upgrade hints. */
export function firstPlanWith(key: IntegrationKey): PlanDefinition | undefined {
  return PLAN_CATALOG.find((plan) => isPurchasable(plan) && plan.integrations.includes(key));
}
