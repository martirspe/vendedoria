import { normalizeText, PendingLine } from './conversation-context';
import type {
  AgentToolTrace,
  CatalogProductView,
} from './sales-agent-tools.service';
import { matchDistrict } from './delivery-plan';

export const SALES_STAGES = [
  'NEW',
  'DISCOVERY',
  'QUALIFICATION',
  'PRODUCT_SEARCH',
  'RECOMMENDATION',
  'OBJECTION_HANDLING',
  'PRODUCT_SELECTED',
  'CHECKOUT',
  'PAYMENT_PENDING',
  'WON',
  'LOST',
  'HUMAN_HANDOFF',
] as const;
export type SalesStage = (typeof SALES_STAGES)[number];
export type ExplicitFact = {
  value: string;
  source: string;
  confidence: 1;
  timestamp: string;
  scope: 'conversation' | 'customer';
  expiresAt?: string;
};
export type SalesState = {
  version: 1;
  stage: SalesStage;
  intent: string;
  turns: number;
  customerFacts: Record<string, ExplicitFact>;
  requirements: Record<string, ExplicitFact>;
  discussedProductIds: string[];
  recommendedProductIds: string[];
  previousRecommendedProductIds: string[];
  previousSelectedProductId?: string;
  rejectedProducts: Array<{ productId: string; reason: string }>;
  selectedProduct?: { productId: string; variantId?: string };
  answeredQuestions: Record<string, string>;
  objections: string[];
  missingInformation: string[];
  pendingLines: PendingLine[];
  orderId?: string;
  paymentStatus?: string;
  lastAction: string;
  nextBestAction: string;
  handoffReason?: string;
  consecutiveFallbacks: number;
  summary: {
    situation: string;
    decisions: string[];
    confirmedFacts: Record<string, string>;
    unresolved: string[];
    nextStep: string;
    updatedAtTurn: number;
  };
};

export function initialSalesState(): SalesState {
  return {
    version: 1,
    stage: 'NEW',
    intent: 'unknown',
    turns: 0,
    customerFacts: {},
    requirements: {},
    discussedProductIds: [],
    recommendedProductIds: [],
    previousRecommendedProductIds: [],
    rejectedProducts: [],
    answeredQuestions: {},
    objections: [],
    missingInformation: [],
    pendingLines: [],
    lastAction: 'none',
    nextBestAction: 'understand_need',
    consecutiveFallbacks: 0,
    summary: {
      situation: '',
      decisions: [],
      confirmedFacts: {},
      unresolved: [],
      nextStep: '',
      updatedAtTurn: 0,
    },
  };
}

export function readSalesState(value: unknown): SalesState {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return initialSalesState();
  const raw = value as Partial<SalesState>;
  if (raw.version !== 1 || !SALES_STAGES.includes(raw.stage as SalesStage))
    return initialSalesState();
  return { ...initialSalesState(), ...structuredClone(raw) };
}

/** Conservative explicit extraction: never promote inferred demographics/preferences to facts. */
export function observeBuyer(
  state: SalesState,
  text: string,
  source: string,
  now = new Date(),
): SalesState {
  const next = structuredClone(state);
  const normalized = normalizeText(text);
  const remember = (
    key: string,
    value: string,
    scope: 'conversation' | 'customer' = 'conversation',
  ) => {
    const fact: ExplicitFact = {
      value,
      source,
      confidence: 1,
      timestamp: now.toISOString(),
      scope,
    };
    (scope === 'customer' ? next.customerFacts : next.requirements)[key] = fact;
    next.answeredQuestions[key] = value;
  };
  const sizeMatches = [
    ...normalized.matchAll(
      /\b(?:talla|tamano|medida)\s*(?:es|:|de)?\s*(\d{1,3}(?:\.\d)?|xxs|xs|s|m|l|xl|xxl|xxxl)\b/g,
    ),
  ];
  const size = sizeMatches
    .filter(
      (match) => !/\b(?:no|sin)\s+$/.test(normalized.slice(0, match.index)),
    )
    .at(-1);
  if (size) remember('size', size[1]);
  if (
    size &&
    /^\s*(?:o|u|\/)\s*(?:\d{1,3}|xxs|xs|s|m|l|xl|xxl)\b/.test(
      normalized.slice((size.index ?? 0) + size[0].length),
    )
  ) {
    delete next.requirements.size;
    delete next.answeredQuestions.size;
    next.missingInformation = [
      ...new Set([...next.missingInformation, 'size']),
    ];
  }
  const budget = normalized.match(
    /\b(?:presupuesto(?:\s+(?:es|de))?|maximo|hasta|no mas de)\s*(?:s\/\s*|soles\s*|\$\s*)?(\d+(?:[.,]\d{1,2})?)/,
  );
  if (budget)
    remember(
      'budget',
      String(Math.round(Number(budget[1].replace(',', '.')) * 100)),
    );
  const color = [
    ...normalized.matchAll(
      /\b(negr[oa]s?|blanc[oa]s?|roj[oa]s?|azul(?:es)?|verde(?:s)?|gris(?:es)?|rosad[oa]s?|beige|marron(?:es)?|amarill[oa]s?)\b/g,
    ),
  ]
    .filter(
      (match) =>
        !/\b(?:no|sin|excepto)\s+(?:el |la |los |las )?$/.test(
          normalized.slice(0, match.index),
        ),
    )
    .at(-1);
  if (color) remember('color', color[1].replace(/s$/, ''));
  const quantity = normalized.match(
    /\b(?:quiero|llevo|comprar|necesito)\s+(\d{1,2}|dos|tres|cuatro)\b/,
  );
  if (quantity)
    remember(
      'quantity',
      String(
        ({ dos: 2, tres: 3, cuatro: 4 } as Record<string, number>)[
          quantity[1]
        ] ?? Number(quantity[1]),
      ),
    );
  const name = text.match(
    /\b(?:me llamo|mi nombre es)\s+([\p{L}]+(?:\s+[\p{L}]+){0,2})/iu,
  );
  if (name)
    remember(
      'name',
      name[1].split(/\s+(?:y|pero|quiero|busco|me|soy)\b/i)[0],
      'customer',
    );
  const preference = text.match(
    /\b(?:siempre prefiero|suelo comprar|mi preferencia es)\s+([^.!?\n]{3,120})/iu,
  );
  if (preference) remember('explicitPreference', preference[1], 'customer');
  if (
    next.pendingLines.length ||
    /\b(?:vivo en|estoy en|envio a|entrega en|distrito de|mi distrito es)\b/.test(
      normalized,
    )
  ) {
    const place = matchDistrict(text).district;
    if (place)
      remember(
        'destination',
        `${place.district}, ${place.province}, ${place.department}`,
      );
  }
  const address = text.match(
    /\b(?:mi direccion es|direccion:)\s*([^\n]{5,200})/iu,
  );
  if (address) remember('address', address[1]);
  for (const [key, expression] of Object.entries({
    brand: /\bmarca\s+([\p{L}\p{N}-]+)/u,
    material: /\bmaterial\s+([\p{L}-]+)/u,
    use: /\bpara\s+(uso diario|regalar|trabajar|deporte|correr|estudiar)\b/u,
  })) {
    const found = normalized.match(expression);
    if (found) remember(key, found[1]);
  }
  // Preserve the buyer's search wording across recent-window eviction; it remains attributed input.
  if (
    /\b(busco|buscando|necesito|quiero (?:un|una|unos|unas))\b/.test(
      normalized,
    ) &&
    !/\b(humano|asesor|persona|reembolso)\b/.test(normalized)
  )
    remember('need', text.slice(0, 600));
  if (
    /\b(muy caro|demasiado caro|carisimo|fuera de mi presupuesto)\b/.test(
      normalized,
    )
  ) {
    next.intent = 'price_objection';
    next.stage = 'OBJECTION_HANDLING';
    next.objections = [...new Set([...next.objections, 'price'])];
  } else if (
    /\b(comprar|compro|lo quiero|la quiero|llevo|pagar|quiero (?:dos|tres|\d+))\b/.test(
      normalized,
    )
  )
    next.intent = 'purchase';
  else if (/\b(precio|cuesta|stock|disponib|talla|envio)\w*/.test(normalized))
    next.intent = 'product_question';
  else if (!/^(hola|gracias|ok)[!. ]*$/.test(normalized))
    next.intent = 'product_search';
  if (
    /\b(ya no quiero|cancela la compra|no voy a comprar)\b/.test(normalized)
  ) {
    next.stage = 'LOST';
    next.intent = 'cancel';
    next.selectedProduct = undefined;
    next.pendingLines = [];
  }
  if (
    /\b(mejor el otro|otra opcion|cambio de opinion|no me gusta|descarta)\b/.test(
      normalized,
    )
  ) {
    next.previousSelectedProductId = next.selectedProduct?.productId;
    if (next.selectedProduct)
      next.rejectedProducts = [
        ...next.rejectedProducts,
        {
          productId: next.selectedProduct.productId,
          reason: 'buyer_changed_choice',
        },
      ].slice(-30);
    next.selectedProduct = undefined;
    next.pendingLines = [];
  }
  next.nextBestAction =
    next.intent === 'purchase'
      ? 'initiate_checkout'
      : next.intent === 'price_objection'
        ? 'handle_objection'
        : 'search_products';
  return next;
}

/** Resolves only unambiguous references against the ordered, hydrated previous recommendations. */
export function resolveSalesReference(
  text: string,
  state: SalesState,
  products: CatalogProductView[],
): CatalogProductView | null {
  const query = normalizeText(text);
  const ordered = state.recommendedProductIds.map((id) =>
    products.find((p) => p.id === id),
  );
  const ordinal = query.match(
    /\b(?:el |la )?(primer[oa]?|segund[oa]|tercer[oa]?|1ro|2do|3ro)\b/,
  );
  if (ordinal)
    return (
      ordered[
        /^(primer|1)/.test(ordinal[1])
          ? 0
          : /^(segund|2)/.test(ordinal[1])
            ? 1
            : 2
      ] ?? null
    );
  const current = ordered.filter((p): p is CatalogProductView => Boolean(p));
  if (/\bmas barato\b/.test(query))
    return current.length
      ? [...current].sort((a, b) => a.basePriceCents - b.basePriceCents)[0]
      : null;
  if (/\b(el otro|la otra|anterior)\b/.test(query)) {
    const candidates = [
      ...new Set([
        ...state.recommendedProductIds,
        ...state.previousRecommendedProductIds,
      ]),
    ].flatMap((id) => products.find((p) => p.id === id) ?? []);
    const other = candidates.filter(
      (p) =>
        p.id !==
        (state.selectedProduct?.productId ?? state.previousSelectedProductId),
    );
    return other.length === 1 ? other[0] : null;
  }
  const color = query.match(
    /\b(el|la)\s+(negro|negra|blanco|blanca|rojo|roja|azul|verde)\b/,
  );
  if (color) {
    const found = current.filter((p) =>
      normalizeText(
        [p.name, ...p.variants.map((v) => v.label)].join(' '),
      ).includes(color[2]),
    );
    return found.length === 1 ? found[0] : null;
  }
  if (
    /\b(ese|esa|eso|lo quiero|la quiero|quiero dos|quiero tres)\b/.test(query)
  )
    return (
      products.find((p) => p.id === state.selectedProduct?.productId) ??
      (current.length === 1 ? current[0] : null)
    );
  return null;
}

export function completeSalesTurn(
  state: SalesState,
  result: {
    tools: AgentToolTrace[];
    escalate: boolean;
    orderId?: string;
    checkoutUrl?: string;
  },
  summaryThreshold: number,
): SalesState {
  const next = structuredClone(state);
  next.turns++;
  const search = result.tools.find((t) => t.name === 'search_catalog');
  const ids = Array.isArray(search?.data?.matchIds)
    ? search.data.matchIds.filter((id): id is string => typeof id === 'string')
    : [];
  if (ids.length) {
    if (JSON.stringify(ids) !== JSON.stringify(next.recommendedProductIds))
      next.previousRecommendedProductIds = next.recommendedProductIds;
    next.recommendedProductIds = ids.slice(0, 12);
    next.discussedProductIds = [
      ...new Set([...next.discussedProductIds, ...ids]),
    ].slice(-60);
    if (
      !['OBJECTION_HANDLING', 'WON', 'LOST', 'PAYMENT_PENDING'].includes(
        next.stage,
      )
    )
      next.stage = next.selectedProduct ? 'PRODUCT_SELECTED' : 'RECOMMENDATION';
  } else if (next.stage === 'NEW') next.stage = 'DISCOVERY';
  const shipping = result.tools.find((t) => t.name === 'quote_shipping');
  if (shipping?.data?.awaitingDelivery && Array.isArray(shipping.data.lines)) {
    next.pendingLines = shipping.data.lines as PendingLine[];
    next.stage = 'CHECKOUT';
    next.missingInformation = ['destination'];
  }
  const variant = result.tools.find((t) => t.name === 'select_variant');
  if (typeof variant?.data?.variantId === 'string' && next.selectedProduct)
    next.selectedProduct.variantId = variant.data.variantId;
  if (result.orderId) {
    next.orderId = result.orderId;
    next.pendingLines = [];
    next.missingInformation = [];
    next.stage = ['PAID', 'FULFILLING', 'SHIPPED', 'COMPLETED'].includes(
      next.paymentStatus ?? '',
    )
      ? 'WON'
      : result.checkoutUrl
        ? 'PAYMENT_PENDING'
        : 'CHECKOUT';
  }
  if (result.escalate) {
    next.stage = 'HUMAN_HANDOFF';
    next.handoffReason =
      (result.tools.find((t) => t.name === 'escalate')?.data
        ?.reason as string) ?? 'review_required';
  }
  next.lastAction =
    result.tools.filter((t) => t.status === 'ok').at(-1)?.name ?? 'reply';
  next.nextBestAction =
    next.stage === 'HUMAN_HANDOFF'
      ? 'handoff_to_human'
      : next.stage === 'PAYMENT_PENDING'
        ? 'verify_payment'
        : next.missingInformation.length
          ? 'ask_critical_question'
          : next.selectedProduct
            ? 'initiate_checkout'
            : ids.length
              ? 'help_customer_choose'
              : 'understand_need';
  if (
    next.turns - next.summary.updatedAtTurn >= summaryThreshold ||
    result.orderId ||
    result.escalate
  ) {
    next.summary = {
      situation: next.stage,
      confirmedFacts: Object.fromEntries(
        Object.entries({ ...next.customerFacts, ...next.requirements }).map(
          ([k, v]) => [k, v.value],
        ),
      ),
      decisions: [
        next.selectedProduct
          ? `selected:${next.selectedProduct.productId}`
          : '',
        next.orderId ? `order:${next.orderId}` : '',
        ...next.rejectedProducts.map(
          (p) => `rejected:${p.productId}:${p.reason}`,
        ),
      ].filter(Boolean),
      unresolved: next.missingInformation,
      nextStep: next.nextBestAction,
      updatedAtTurn: next.turns,
    };
  }
  return next;
}
