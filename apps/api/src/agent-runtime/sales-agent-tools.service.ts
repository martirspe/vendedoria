import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type ProductKind } from '@prisma/client';
import { CATALOG_CANDIDATES, maximumPrice, searchCatalogIds } from '../catalog/catalog-search';
import { PrismaService } from '../prisma/prisma.service';
import { OrderShipping, OrdersService } from '../orders/orders.service';
import { orderReference } from '../orders/settlement';
import { SalesSearchService } from './sales-search.service';
import type { ShippingRules } from '../storefront/shipping';
import { variantOptions } from '../catalog/variant-options';
import {
  customDomainUrl,
  DEFAULT_STOREFRONT_URL_TEMPLATE,
  storefrontUrl,
} from '../storefront/storefront-host';
import {
  activeCustomDomain,
  isIntegrationActive,
} from '../integrations/integration-state';
import { normalizeText, PendingLine } from './conversation-context';
import type { DeliveryPlan } from './delivery-plan';

export type DeliveryQuote = Extract<DeliveryPlan, { kind: 'quote' }>;

const REFERENCE_RATE_NOTE =
  'Tarifa referencial: la cobertura se coordina antes del despacho.';

const CURRENCY_SYMBOLS: Record<string, string> = { PEN: 'S/' };

/** "S/ 98.90": the amount as buyers write it in the chat. */
export function moneyLabel(currency: string, cents: number): string {
  return `${CURRENCY_SYMBOLS[currency] ?? currency} ${(cents / 100).toFixed(2)}`;
}

const SERVICE_MODE_LABELS: Record<string, string> = {
  onsite: 'en el local',
  home: 'a domicilio',
  online: 'en línea',
};

/** "Servicio · 60 min · a domicilio": what the agent may state about a service, nothing more. */
export function serviceLabel(
  durationMinutes: number | null,
  mode: string | null,
): string {
  return [
    'Servicio',
    durationMinutes ? `${durationMinutes} min aprox.` : null,
    mode ? SERVICE_MODE_LABELS[mode] : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const FACT_LIST_KEYS = [
  'useCases',
  'exclusions',
  'compatibility',
  'highlights',
  'benefits',
  'usage',
  'notes',
  'contents',
  'requirements',
] as const;
const FACT_TEXT_KEYS = [
  'returns',
  'digitalFormat',
  'license',
  'accessDuration',
  'size',
  'family',
  'intensity',
  'audience',
  'warranty',
  'coverage',
  'cancellation',
] as const;
const FACT_PAIR_KEYS = [
  { key: 'attributes', first: 'name', second: 'value' },
  { key: 'faqs', first: 'question', second: 'answer' },
] as const;
const FAQ_MAX_CHARS = 600;
const FACT_MAX_ITEMS = 20;
const FACT_MAX_CHARS = 400;
const DESCRIPTION_FULL_MAX_CHARS = 5000;

/** Buyer-facing product details as published on the store page, trimmed for the prompt. */
export function productFacts(details: unknown): Record<string, string | string[]> | undefined {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return undefined;
  const source = details as Record<string, unknown>;
  const text = (value: unknown) =>
    typeof value === 'string' && value.trim() ? value.trim().slice(0, FACT_MAX_CHARS) : null;
  const facts: Record<string, string | string[]> = {};
  for (const key of FACT_TEXT_KEYS) {
    const value = typeof source[key] === 'string' && source[key].trim() ? source[key].trim() : null;
    if (value) facts[key] = value;
  }
  for (const key of FACT_LIST_KEYS) {
    const items = Array.isArray(source[key])
      ? (source[key] as unknown[]).map(text).filter((item): item is string => Boolean(item))
      : [];
    if (items.length) facts[key] = ['requirements', 'exclusions', 'compatibility'].includes(key) ? items : items.slice(0, FACT_MAX_ITEMS);
  }
  const scent = Array.isArray(source.scent)
    ? (source.scent as unknown[]).flatMap((item) => {
        const entry = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        const name = text(entry.name);
        const description = text(entry.description);
        return name ? [description ? `${name}: ${description}` : name] : [];
      })
    : [];
  if (scent.length) facts.scent = scent.slice(0, FACT_MAX_ITEMS);
  for (const { key, first, second } of FACT_PAIR_KEYS) {
    const items = Array.isArray(source[key])
      ? (source[key] as unknown[]).flatMap((item) => {
          const entry = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
          const a = text(entry[first]);
          const b = typeof entry[second] === 'string' ? entry[second].trim() : '';
          const limit = key === 'faqs' ? FAQ_MAX_CHARS : FACT_MAX_CHARS;
          return a && b ? [`${a}: ${b.slice(0, limit)}`] : [];
        })
      : [];
    if (items.length) facts[key] = items.slice(0, key === 'faqs' ? 10 : 20);
  }
  return Object.keys(facts).length ? facts : undefined;
}

/** Words the merchant says buyers use for the product; they weigh like its name in searches. */
export function productKeywords(details: unknown): string[] {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return [];
  const keywords = (details as Record<string, unknown>).keywords;
  return Array.isArray(keywords)
    ? keywords.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 20)
    : [];
}

export function placeLabel(place: {
  district: string;
  province: string;
}): string {
  return place.district === place.province
    ? place.district
    : `${place.district}, ${place.province}`;
}

/**
 * Product references written by the store: `Ref: P-{handle}` on product pages and
 * `• {qty} × {name} — {total} [P-{handle}:{variantId}]` per cart line.
 */
const CART_LINE =
  /^\s*•\s*(\d{1,3})\s*[×x]\s.*\[P-([a-z0-9][a-z0-9-]{0,99})(?::([a-z0-9]{10,40}))?\]\s*$/gim;
const PRODUCT_REF = /\bP-([a-z0-9][a-z0-9-]{0,99})/gi;
const MAX_REFS = 10;
/** Someone to talk to, as buyers name it. Matched against normalized text (lowercase, no accents). */
const HUMAN_TARGET =
  '(?:(?:una?|algun|alguna)\\s+)?(?:persona|humano|humana|ser humano|asesor|asesora|agente|operador|operadora|encargado|encargada|alguien|vendedor real|vendedora real)\\b';
const HUMAN_REQUEST = [
  new RegExp(`\\b(?:hablar|conversar|comunicarme|comunicar|contactarme|contactar|chatear|atenderme|atiendame)\\s+(?:con|por)\\s+${HUMAN_TARGET}`),
  new RegExp(`\\b(?:pasame|comunicame|conectame|derivame|transfiereme|comunicarme)\\s+(?:con|a)\\s+${HUMAN_TARGET}`),
  /\b(?:quiero|necesito|prefiero|me atiende|me puede atender|me atienda)\s+(?:un|una|algun|alguna)\s+(?:persona|humano|asesor|asesora|agente|operador|operadora|encargado|encargada)\b/,
  /\b(?:persona real|ser humano|atencion humana|atencion personalizada|agente humano|asesor humano|asesora humana|un humano)\b/,
  /\bno\s+quiero\s+(?:hablar\s+con\s+)?(?:un\s+)?(?:bot|robot)\b/,
  /\bhay alguien(?:\s+ahi)?\s*\??$/,
];
/** Words that say what the buyer wants to do, not which product they mean. */
const STOPWORDS = new Set([
  'hola',
  'buenas',
  'buenos',
  'dias',
  'tardes',
  'noches',
  'gracias',
  'quiero',
  'queria',
  'quisiera',
  'comprar',
  'compro',
  'comprarlo',
  'comprarla',
  'busco',
  'buscando',
  'necesito',
  'tienes',
  'tienen',
  'tiene',
  'hay',
  'venden',
  'vendes',
  'para',
  'por',
  'como',
  'cuanto',
  'cuesta',
  'precio',
  'una',
  'uno',
  'unos',
  'unas',
  'los',
  'las',
  'del',
  'que',
  'con',
  'sin',
  'este',
  'esta',
  'ese',
  'esa',
  'eso',
  'algo',
  'mas',
  'favor',
  'porfa',
  'interesa',
  'ver',
  'pedido',
  'pagar',
  'link',
  'pago',
  'foto',
  'fotos',
  'imagen',
  'eres',
  'bot',
  'robot',
  'humano',
]);

/** Words that ask to browse the catalog rather than naming what to look for. */
const BROWSE_WORDS = new Set([
  'catalogo',
  'producto',
  'productos',
  'opcion',
  'opciones',
  'muestrame',
  'muestra',
  'ensename',
  'mostrar',
  'otros',
  'otras',
  'otro',
  'otra',
  'siguiente',
  'siguientes',
  'recomiendame',
  'recomienda',
  'recomiendas',
  'recomendacion',
  'recomendaciones',
  'ofrecen',
  'todo',
  'todos',
  'disponible',
  'disponibles',
  'modelos',
]);
const BROWSE_WINDOW = 3;
/** A word of the product name weighs more than one found in its description or categories. */
const NAME_HIT_SCORE = 3;
/** Same "featured" order as the web store. */
const FEATURED_ORDER = [
  { sortOrder: 'asc' as const },
  { updatedAt: 'desc' as const },
];
const PRODUCT_VIEW_INCLUDE = {
  variants: true,
  components: { select: { quantity: true, component: { select: { isAvailable: true, stockUnlimited: true, stockQty: true } } } },
  media: {
    where: { kind: 'image' },
    orderBy: { sortOrder: 'asc' as const },
    take: 1,
    select: { url: true },
  },
};

function queryTokens(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

/** Singular candidates so "perfumes" meets "perfume" and "colores" meets "color". */
function wordForms(word: string): string[] {
  const forms = [word];
  if (word.length > 3 && word.endsWith('s')) forms.push(word.slice(0, -1));
  if (word.length > 4 && word.endsWith('es')) forms.push(word.slice(0, -2));
  return forms;
}

function sameWord(a: string, b: string): boolean {
  const forms = wordForms(b);
  return wordForms(a).some((form) => forms.includes(form));
}

function wordsOf(text: string): string[] {
  return normalizeText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

export type CatalogOverview = {
  total: number;
  /** Categories by product count; `names` keeps every spelling stored for that category. */
  categories: Array<{ label: string; names: string[]; count: number }>;
  /** Published web store, or null when it is not public. */
  storeUrl: string | null;
};

export type BrowseRequest =
  | { kind: 'more' }
  | { kind: 'category'; category: CatalogOverview['categories'][number] }
  | { kind: 'catalog' };

export type OrderLine = {
  product: CatalogProductView;
  variant?: CatalogProductView['variants'][number];
  quantity: number;
};

export type ProductRef = {
  handle: string;
  variantId: string | null;
  quantity: number;
  /** True when it comes from a cart line, i.e. the buyer sent a full order. */
  fromCart: boolean;
};

export type AgentRuntimeMode = 'production' | 'playground';

export type AgentToolName =
  | 'search_catalog'
  | 'get_product_availability'
  | 'lookup_faq'
  | 'create_order'
  | 'create_payment_link'
  | 'quote_shipping'
  | 'escalate';
// Read tools and backend state traces share the existing audit contract.

export type AgentToolTrace = {
  name: AgentToolName | 'select_variant' | 'search_products' | 'get_product' | 'get_price' | 'check_inventory' | 'get_product_variants' | 'calculate_shipping' | 'get_commercial_policy' | 'get_order_status';
  status: 'ok' | 'error' | 'skipped';
  summary: string;
  data?: Record<string, unknown>;
};

export type CatalogProductView = {
  id: string;
  handle: string;
  name: string;
  brand?: string | null;
  descriptionShort: string | null;
  /** Long store description, trimmed for the prompt. */
  descriptionFull?: string | null;
  /** Product line inside the brand. */
  line?: string | null;
  /** Merchant-written facts (size, notes, usage...): the only product details the seller may state. */
  facts?: Record<string, string | string[]>;
  /** Search synonyms; never shown to the buyer. */
  keywords?: string[];
  /** Rank from the tenant-wide indexed search, before loading this bounded candidate. */
  searchRank?: number;
  basePriceCents: number;
  /** Struck-through price shown in the store, only when it is above the current price. */
  compareAtPriceLabel?: string | null;
  currency: string;
  categories: string[];
  isAvailable: boolean;
  stockUnlimited: boolean;
  stockQty: number | null;
  stockLabel: string;
  priceLabel: string;
  /** Services are booked and paid without shipping; the business confirms the schedule. */
  isService: boolean;
  /** Digital products are never shipped: the access is sent once the payment is confirmed. */
  isDigital?: boolean;
  /** Product page in the published store, or null when the store is not public. */
  productUrl: string | null;
  /** Main product photo (first gallery image, else the first variant image). */
  imageUrl: string | null;
  variants: Array<{
    id: string;
    label: string;
    priceCents: number;
    priceLabel: string;
    stockLabel: string;
    isAvailable: boolean;
  }>;
};

@Injectable()
export class SalesAgentToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly config: ConfigService,
    @Optional() private readonly semantic?: SalesSearchService,
  ) {}

  extractProductRefs(text: string): ProductRef[] {
    const refs = new Map<string, ProductRef>();
    for (const match of text.matchAll(CART_LINE)) {
      const handle = match[2].toLowerCase();
      const variantId = match[3] ?? null;
      refs.set(`${handle}:${variantId ?? ''}`, {
        handle,
        variantId,
        quantity: Math.min(Math.max(Number(match[1]), 1), 99),
        fromCart: true,
      });
    }
    for (const match of text.matchAll(PRODUCT_REF)) {
      const handle = match[1].toLowerCase();
      if (![...refs.values()].some((ref) => ref.handle === handle)) {
        refs.set(`${handle}:`, {
          handle,
          variantId: null,
          quantity: 1,
          fromCart: false,
        });
      }
    }
    return [...refs.values()].slice(0, MAX_REFS);
  }

  /**
   * Search the full tenant catalog in PostgreSQL, then load only bounded candidates
   * and the buyer's explicit references. Prices and stock are never cached.
   */
  async listAvailableProducts(
    tenantId: string,
    referencedHandles: string[] = [],
    contextIds: string[] = [],
    inboundText = '',
  ): Promise<CatalogProductView[]> {
    const tokens = queryTokens(inboundText).filter((token) => !BROWSE_WORDS.has(token));
    const [lexicalIds, semanticIds] = await Promise.all([searchCatalogIds(this.prisma, tenantId, tokens, {
      available: true,
      maxPriceCents: maximumPrice(inboundText),
    }), this.semantic?.candidates(tenantId, inboundText, 'product') ?? Promise.resolve([])]);
    const ids = [...new Set([...lexicalIds, ...semanticIds])].sort((a, b) => {
      const rank = (id: string) => [lexicalIds, semanticIds].reduce((sum, list) => sum + (list.includes(id) ? 1 / (60 + list.indexOf(id)) : 0), 0);
      return rank(b) - rank(a);
    });
    const pinned = [
      ...(referencedHandles.length
        ? [{ handle: { in: referencedHandles } }]
        : []),
      ...(contextIds.length ? [{ id: { in: contextIds } }] : []),
    ];
    const [products, referenced, base] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId, isAvailable: true, ...(tokens.length ? { id: { in: ids } } : {}) },
        include: PRODUCT_VIEW_INCLUDE,
        take: CATALOG_CANDIDATES,
        orderBy: FEATURED_ORDER,
      }),
      pinned.length
        ? this.prisma.product.findMany({
            where: { tenantId, isAvailable: true, OR: pinned },
            include: PRODUCT_VIEW_INCLUDE,
            take: 40,
          })
        : Promise.resolve([]),
      this.storeBase(tenantId),
    ]);
    const byId = new Map(
      [...referenced, ...products].map((product) => [product.id, product]),
    );
    const maxPrice = maximumPrice(inboundText);
    return [...byId.values()].map((product) => ({
      ...this.toStoreView(product, base),
      ...(ids.includes(product.id) ? { searchRank: ids.length - ids.indexOf(product.id) } : {}),
    })).filter((product) => contextIds.includes(product.id) || referencedHandles.includes(product.handle) || maxPrice === undefined || product.basePriceCents <= maxPrice);
  }

  /** Hydration for function calls/references; a vector payload never supplies facts. */
  async getProducts(tenantId: string, ids: string[]): Promise<CatalogProductView[]> {
    const [rows, base] = await Promise.all([
      this.prisma.product.findMany({ where: { tenantId, id: { in: ids.slice(0, 12) }, isAvailable: true }, include: PRODUCT_VIEW_INCLUDE }),
      this.storeBase(tenantId),
    ]);
    return rows.map((row) => this.toStoreView(row, base));
  }

  async existingOrder(tenantId: string, conversationId: string | null | undefined, orderId: string) {
    if (!conversationId) return null;
    const order = await this.prisma.order.findFirst({ where: { id: orderId, tenantId, conversationId }, include: { payments: { take: 1, orderBy: { createdAt: 'desc' } } } });
    return order ? { id: order.id, status: order.status, orderRef: orderReference(order), checkoutUrl: order.payments[0]?.checkoutUrl } : null;
  }

  /** Category counts of the whole available catalog, used to summarize it instead of listing it. */
  async catalogOverview(tenantId: string): Promise<CatalogOverview> {
    const [rows, storeUrl] = await Promise.all([
      this.prisma.$queryRaw<Array<{ total: number; categories: Array<{ label: string; names: string[]; count: number }> }>>(Prisma.sql`
        WITH available AS (
          SELECT categories FROM "Product" WHERE "tenantId" = ${tenantId} AND "isAvailable" = true
        ), facets AS (
          SELECT lower(translate(trim(category), 'áéíóúüñ', 'aeiouun')) AS key,
            min(trim(category)) AS label, array_agg(DISTINCT category) AS names, count(*)::int AS count
          FROM available CROSS JOIN LATERAL (SELECT DISTINCT unnest(categories) AS category) c
          WHERE trim(category) <> '' GROUP BY key ORDER BY count DESC, label LIMIT 24
        )
        SELECT (SELECT count(*)::int FROM available) AS total,
          coalesce((SELECT jsonb_agg(to_jsonb(facets) - 'key') FROM facets), '[]'::jsonb) AS categories`),
      this.storeBase(tenantId),
    ]);
    return {
      total: rows[0]?.total ?? 0,
      categories: rows[0]?.categories ?? [],
      storeUrl,
    };
  }

  /**
   * Whether the buyer asks to browse ("ver el catálogo", "tienen perfumes?", "ver más")
   * rather than naming a product. Any extra descriptive word ("perfume floral") keeps the
   * regular search, which ranks by those words.
   */
  browseRequest(text: string, overview: CatalogOverview): BrowseRequest | null {
    const normalized = normalizeText(text).replace(/\bq\b/g, 'que');
    const tokens = queryTokens(text).filter(
      (token) => !BROWSE_WORDS.has(token),
    );
    if (
      /\b(ver mas|mas opciones|otr[oa]s|que mas (tienen|hay)|mas productos|siguientes)\b/.test(
        normalized,
      ) &&
      !tokens.length
    ) {
      return { kind: 'more' };
    }
    const scored = overview.categories
      .map((category) => {
        const words = category.names.flatMap(wordsOf);
        return {
          category,
          hits: tokens.filter((token) =>
            words.some((word) => sameWord(token, word)),
          ),
        };
      })
      .filter((item) => item.hits.length > 0)
      .sort(
        (a, b) =>
          b.hits.length - a.hits.length || b.category.count - a.category.count,
      );
    const best = scored[0];
    if (best && tokens.every((token) => best.hits.includes(token))) {
      return { kind: 'category', category: best.category };
    }
    const asksCatalog =
      /\b(productos?|catalogo|que (tienen|venden|hay|ofrecen)|recomiend\w*|opciones|muestrame|ensename)\b/.test(
        normalized,
      );
    return asksCatalog && !tokens.length ? { kind: 'catalog' } : null;
  }

  /**
   * Next products to present while browsing, in the store's featured order, skipping the
   * ones already shown in this chat. `remaining` counts what is left after this page.
   */
  async browseProducts(
    tenantId: string,
    options: { categoryNames?: string[]; excludeIds?: string[] },
  ): Promise<{ products: CatalogProductView[]; remaining: number }> {
    const where = {
      tenantId,
      isAvailable: true,
      ...(options.categoryNames?.length
        ? { categories: { hasSome: options.categoryNames } }
        : {}),
      ...(options.excludeIds?.length
        ? { id: { notIn: options.excludeIds } }
        : {}),
    };
    const [rows, total, base] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_VIEW_INCLUDE,
        orderBy: FEATURED_ORDER,
        take: BROWSE_WINDOW,
      }),
      this.prisma.product.count({ where }),
      this.storeBase(tenantId),
    ]);
    return {
      products: rows.map((product) => this.toStoreView(product, base)),
      remaining: Math.max(0, total - rows.length),
    };
  }

  private async storeBase(tenantId: string): Promise<string | null> {
    const storefront = await this.prisma.storefront.findUnique({
      where: { tenantId },
      select: { status: true, tenant: { select: { slug: true } } },
    });
    if (storefront?.status !== 'PUBLISHED') return null;
    if (!(await isIntegrationActive(this.prisma, tenantId, 'store')))
      return null;
    const template =
      this.config.get<string>('STOREFRONT_URL_TEMPLATE') ??
      DEFAULT_STOREFRONT_URL_TEMPLATE;
    const domain = await activeCustomDomain(this.prisma, tenantId);
    return (
      domain
        ? customDomainUrl(template, domain)
        : storefrontUrl(template, storefront.tenant.slug)
    ).replace(/\/$/, '');
  }

  private toStoreView(
    product: Parameters<SalesAgentToolsService['toView']>[0] & {
      isPublishedOnStore: boolean;
    },
    base: string | null,
  ): CatalogProductView {
    return {
      ...this.toView(product),
      productUrl:
        base && product.isPublishedOnStore
          ? `${base}/producto/${encodeURIComponent(product.handle)}`
          : null,
    };
  }

  searchCatalog(
    inboundText: string,
    products: CatalogProductView[],
    refs: ProductRef[] = [],
  ): { matches: CatalogProductView[]; trace: AgentToolTrace } {
    const query = normalizeText(inboundText);
    const tokens = queryTokens(inboundText);
    const referenced = refs
      .map((ref) => products.find((product) => product.handle === ref.handle))
      .filter((product): product is CatalogProductView => Boolean(product))
      .filter((product, index, list) => list.indexOf(product) === index);

    if (referenced.length) {
      return {
        matches: referenced,
        trace: {
          name: 'search_catalog',
          status: 'ok',
          summary: `Productos referenciados: ${referenced.map((item) => item.name).join(', ')}`,
          data: {
            matchIds: referenced.map((item) => item.id),
            count: referenced.length,
            byReference: true,
          },
        },
      };
    }

    const scored = products
      .map((product) => {
        const nameWords = wordsOf(
          [product.name, product.brand ?? '', ...(product.keywords ?? [])].join(' '),
        );
        const haystack = normalizeText(
          [
            product.name,
            product.handle,
            product.brand ?? '',
            product.line ?? '',
            product.descriptionShort ?? '',
            product.descriptionFull ?? '',
            ...Object.values(product.facts ?? {}).flat(),
            product.categories.join(' '),
            ...product.variants.flatMap((variant) => [
              variant.label,
              variant.priceLabel,
            ]),
          ].join(' '),
        );
        const score = tokens.reduce((acc, token) => {
          if (nameWords.some((word) => sameWord(token, word))) {
            return acc + NAME_HIT_SCORE;
          }
          return wordForms(token).some((form) => haystack.includes(form))
            ? acc + 1
            : acc;
        }, 0);
        return { product, score: score + (product.searchRank ?? 0) / CATALOG_CANDIDATES };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    const best = scored[0]?.score ?? 0;
    let matches = scored
      .filter((item) => item.score * 2 >= best)
      .slice(0, 3)
      .map((item) => item.product);

    const asksCatalog =
      /productos?|catalogo|que\s+tienen|que\s+venden|recomend/.test(query);
    if (!matches.length && asksCatalog && products.length && tokens.every((token) => BROWSE_WORDS.has(token))) {
      matches = products.slice(0, 3);
    }

    return {
      matches,
      trace: {
        name: 'search_catalog',
        status: matches.length ? 'ok' : 'skipped',
        summary: matches.length
          ? `Catálogo: ${matches.map((item) => item.name).join(', ')}`
          : 'Sin coincidencias en catálogo',
        data: {
          matchIds: matches.map((item) => item.id),
          count: matches.length,
          browseFallback: Boolean(!tokens.length || asksCatalog),
        },
      },
    };
  }

  getAvailability(product: CatalogProductView): AgentToolTrace {
    const variantSummary = product.variants.length
      ? ` · variantes: ${product.variants
          .slice(0, 3)
          .map((variant) => `${variant.label} (${variant.priceLabel})`)
          .join(', ')}`
      : '';
    return {
      name: 'get_product_availability',
      status: 'ok',
      summary: `${product.name}: ${product.priceLabel} · ${product.stockLabel}${variantSummary}`,
      data: {
        productId: product.id,
        priceCents: product.basePriceCents,
        currency: product.currency,
        stockUnlimited: product.stockUnlimited,
        stockQty: product.stockQty,
        isAvailable: product.isAvailable,
        variants: product.variants,
      },
    };
  }

  lookupFaqs(
    inboundText: string,
    faqs: Array<{
      id: string;
      question: string;
      answer: string;
      tags: string[];
    }>,
    retrievedIds: string[] = [],
  ): {
    matches: Array<{ id: string; question: string; answer: string }>;
    trace: AgentToolTrace;
  } {
    const query = inboundText.toLowerCase();
    const tokens = query
      .split(/\s+/)
      .map((token) => token.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter((token) => token.length > 2);

    const scored = faqs
      .map((faq) => {
        const haystack =
          `${faq.question} ${faq.answer} ${faq.tags.join(' ')}`.toLowerCase();
        const score = tokens.reduce(
          (acc, token) => (haystack.includes(token) ? acc + 1 : acc),
          0,
        );
        const questionBoost = tokens.some((token) =>
          faq.question.toLowerCase().includes(token),
        )
          ? 2
          : 0;
        return { faq, score: score + questionBoost + (retrievedIds.includes(faq.id) ? 5 : 0) };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => ({
        id: item.faq.id,
        question: item.faq.question,
        answer: item.faq.answer,
      }));

    return {
      matches: scored,
      trace: {
        name: 'lookup_faq',
        status: scored.length ? 'ok' : 'skipped',
        summary: scored.length
          ? `FAQs: ${scored.map((item) => item.question).join(' · ')}`
          : 'Sin FAQs relevantes',
        data: {
          matchIds: scored.map((item) => item.id),
          count: scored.length,
        },
      },
    };
  }

  /** Order lines for referenced cart items, priced from the catalog (never from the message). */
  orderLinesFromRefs(
    refs: ProductRef[],
    products: CatalogProductView[],
  ): OrderLine[] {
    return refs
      .filter((ref) => ref.fromCart)
      .flatMap((ref) => {
        const product = products.find((item) => item.handle === ref.handle);
        if (!product) return [];
        const variant = ref.variantId
          ? product.variants.find((item) => item.id === ref.variantId)
          : undefined;
        if (ref.variantId && !variant) return [];
        return [{ product, variant, quantity: ref.quantity }];
      });
  }

  /** The business's shipping settings; they apply with or without the store add-on. */
  async shippingRules(tenantId: string): Promise<ShippingRules | null> {
    return this.prisma.storefront.findUnique({
      where: { tenantId },
      select: {
        deliveryEnabled: true,
        freeShippingFromCents: true,
        pickupEnabled: true,
        pickupAddress: true,
        shippingOriginUbigeo: true,
        carrierRates: true,
      },
    });
  }

  subtotalCents(lines: OrderLine[]): number {
    return lines.reduce(
      (sum, line) =>
        sum +
        Math.max(1, line.quantity) *
          (line.variant?.priceCents ?? line.product.basePriceCents),
      0,
    );
  }

  /** Lines a previous turn left waiting for delivery, re-read from the current catalog. */
  orderLinesFromPending(
    pending: PendingLine[],
    products: CatalogProductView[],
  ): OrderLine[] {
    const lines = pending.flatMap((line): OrderLine[] => {
      const product = products.find((item) => item.id === line.productId);
      if (!product) return [];
      const variant = line.variantId
        ? product.variants.find((item) => item.id === line.variantId)
        : undefined;
      if (line.variantId && !variant) return [];
      return [{ product, variant, quantity: line.quantity }];
    });
    return lines.length === pending.length ? lines : [];
  }

  /** Trace of the delivery step; an `ask` stores the lines so the next turn can finish the order. */
  deliveryTrace(plan: DeliveryPlan, lines: OrderLine[]): AgentToolTrace {
    const currency = lines[0]?.product.currency ?? 'PEN';
    if (plan.kind === 'quote') {
      const where = plan.place ? ` a ${placeLabel(plan.place)}` : '';
      return {
        name: 'quote_shipping',
        status: 'ok',
        summary: `${plan.charge.label}${where}: ${plan.charge.free ? 'gratis' : moneyLabel(currency, plan.charge.cents)}`,
        data: {
          mode: plan.charge.mode,
          cents: plan.charge.cents,
          free: plan.charge.free,
          ubigeo: plan.place?.code ?? null,
        },
      };
    }
    if (plan.kind === 'ask') {
      return {
        name: 'quote_shipping',
        status: 'skipped',
        summary: plan.candidates.length
          ? 'Distrito con varios homónimos: se pidió distrito y provincia'
          : 'Se pidió el distrito de entrega para cotizar el envío',
        data: {
          awaitingDelivery: true,
          lines: lines.map((line) => ({
            productId: line.product.id,
            variantId: line.variant?.id ?? null,
            quantity: Math.max(1, line.quantity),
          })),
        },
      };
    }
    return {
      name: 'quote_shipping',
      status: 'skipped',
      summary:
        'Sin formas de entrega configuradas: la entrega se coordina en el chat',
    };
  }

  async createOrderWithOptionalLink(params: {
    tenantId: string;
    mode: AgentRuntimeMode;
    lines: OrderLine[];
    conversationId?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    createPaymentLink: boolean;
    delivery?: DeliveryQuote;
  }): Promise<{
    traces: AgentToolTrace[];
    orderId?: string;
    /** Reference the buyer sees for the order (code or short id). */
    orderRef?: string;
    checkoutUrl?: string;
    dryRun: boolean;
  }> {
    const lines = params.lines.map((line) => ({
      ...line,
      quantity: Math.max(1, line.quantity),
      unitCents: line.variant?.priceCents ?? line.product.basePriceCents,
      title: line.variant
        ? `${line.product.name} (${line.variant.label})`
        : line.product.name,
    }));
    const shipping = params.delivery
      ? this.orderShipping(params.delivery)
      : undefined;
    const totalCents =
      lines.reduce((sum, line) => sum + line.quantity * line.unitCents, 0) +
      (shipping?.cents ?? 0);
    const currency = lines[0].product.currency;
    const label = lines
      .map((line) => `${line.quantity}× ${line.title}`)
      .join(', ');

    if (params.mode === 'playground') {
      const fakeOrderId = `pg_order_${lines[0].product.handle}`;
      const fakeUrl = params.createPaymentLink
        ? `https://playground.local/checkout/${fakeOrderId}`
        : undefined;
      const traces: AgentToolTrace[] = [
        {
          name: 'create_order',
          status: 'ok',
          summary: `Pedido de prueba (no guarda en Pedidos): ${label}`,
          data: {
            dryRun: true,
            orderId: fakeOrderId,
            totalCents,
            currency,
          },
        },
      ];
      if (params.createPaymentLink) {
        traces.push({
          name: 'create_payment_link',
          status: 'ok',
          summary: 'Link de pago de prueba (no es un cobro real)',
          data: { dryRun: true, checkoutUrl: fakeUrl },
        });
      }
      return {
        traces,
        orderId: fakeOrderId,
        checkoutUrl: fakeUrl,
        dryRun: true,
      };
    }

    try {
      const order = await this.ordersService.create(
        params.tenantId,
        {
          conversationId: params.conversationId ?? undefined,
          customerName: params.customerName ?? undefined,
          customerPhone: params.customerPhone ?? undefined,
          currency,
          items: lines.map((line) => ({
            productId: line.product.id,
            ...(line.variant ? { variantId: line.variant.id } : {}),
            title: line.title,
            quantity: line.quantity,
            unitCents: line.unitCents,
          })),
          createPaymentLink: params.createPaymentLink,
          sendLinkToChat: false,
        },
        shipping,
      );

      const payment = order.payments?.[0];
      const traces: AgentToolTrace[] = [
        {
          name: 'create_order',
          status: 'ok',
          summary: `Pedido creado: ${label}`,
          data: {
            dryRun: false,
            orderId: order.id,
            totalCents: order.totalCents,
            currency: order.currency,
          },
        },
      ];

      if (params.createPaymentLink) {
        traces.push({
          name: 'create_payment_link',
          status: payment?.checkoutUrl ? 'ok' : 'error',
          summary: payment?.checkoutUrl
            ? 'Link de pago generado para el comprador'
            : 'No se pudo generar el link de pago',
          data: {
            dryRun: false,
            paymentId: payment?.id,
            checkoutUrl: payment?.checkoutUrl ?? null,
          },
        });
      }

      return {
        traces,
        orderId: order.id,
        orderRef: orderReference(order),
        checkoutUrl: payment?.checkoutUrl ?? undefined,
        dryRun: false,
      };
    } catch (error) {
      return {
        traces: [
          {
            name: 'create_order',
            status: 'error',
            summary:
              error instanceof Error
                ? `No se pudo crear el pedido: ${error.message}`
                : 'No se pudo crear el pedido',
          },
        ],
        dryRun: false,
      };
    }
  }

  /** Same delivery record as web store orders, so Orders and fulfillment read both alike. */
  private orderShipping(quote: DeliveryQuote): OrderShipping {
    const pickup = quote.charge.mode === 'PICKUP';
    return {
      cents: quote.charge.cents,
      delivery: {
        mode: quote.charge.mode,
        label: quote.charge.label,
        address: pickup ? null : quote.address,
        ubigeo: quote.place?.code ?? null,
        district: quote.place?.district ?? null,
        province: quote.place?.province ?? null,
        department: quote.place?.department ?? null,
        reference: null,
        eta: pickup ? quote.pickupAddress : REFERENCE_RATE_NOTE,
        free: quote.charge.free,
      },
    };
  }

  escalateTrace(reason: string): AgentToolTrace {
    return {
      name: 'escalate',
      status: 'ok',
      summary: `Escalado a humano: ${reason}`,
      data: { reason },
    };
  }

  /** Explicit requests only: "persona" or "humano" alone also appear in product questions. */
  wantsHuman(text: string): boolean {
    return HUMAN_REQUEST.some((pattern) => pattern.test(normalizeText(text)));
  }

  /** A complaint about an order already placed: the team must follow it up, the seller cannot. */
  isOrderComplaint(text: string): boolean {
    const normalized = normalizeText(text);
    return (
      /\bpedido\b/.test(normalized) &&
      /\b(no\s+(me\s+)?(llega|llego|ha\s+llegado)|todavia\s+no\s+llega|demora|retras\w*|lleg[oa]\s+(mal|rot[oa]|incomplet[oa]|abiert[oa]|equivocad[oa])|reclamo)\b/.test(
        normalized,
      )
    );
  }

  wantsPurchase(text: string): boolean {
    return /\b(?:comprar|hacer\s+(un|el|mi|este)\s+pedido|pagar|checkout|link\s+de\s+pago|quiero\s+(ese|este|esa|esta|el|la)|lo\s+quiero|la\s+quiero|l[oa]\s+(llevo|compro|pido)|(separ|reserv|apart)(a|as|ame|alo|ala|amelo|amela|ar)|me\s+l[oa]\s+(separas|reservas|envias|mandas))\b/.test(
      normalizeText(text),
    );
  }

  /**
   * The single product the buyer named without ambiguity: a store reference, or a word
   * of the message that appears in exactly one product name ("zentro", not "perfume").
   */
  identifyProduct(
    text: string,
    products: CatalogProductView[],
    refs: ProductRef[] = [],
  ): CatalogProductView | null {
    const exact = products.filter((product) => normalizeText(text).includes(normalizeText(product.name)));
    if (exact.length === 1) return exact[0];
    const referenced = new Set(
      refs
        .map((ref) => products.find((product) => product.handle === ref.handle))
        .filter(Boolean),
    );
    if (referenced.size) {
      return referenced.size === 1
        ? ([...referenced][0] as CatalogProductView)
        : null;
    }
    const names = products.map((product) => ({
      product,
      words: wordsOf(product.name),
    }));
    const hits = new Set<CatalogProductView>();
    for (const token of queryTokens(text)) {
      const owners = names.filter((item) =>
        item.words.some((word) => sameWord(token, word)),
      );
      if (owners.length === 1) hits.add(owners[0].product);
    }
    return hits.size === 1 ? [...hits][0] : null;
  }

  private toView(product: {
    id: string;
    handle: string;
    name: string;
    brand?: string | null;
    descriptionShort: string | null;
    descriptionFull?: string | null;
    line?: string | null;
    details?: unknown;
    basePriceCents: number;
    compareAtPriceCents?: number | null;
    currency: string;
    categories: string[];
    isAvailable: boolean;
    stockUnlimited: boolean;
    stockQty: number | null;
    kind?: ProductKind;
    durationMinutes?: number | null;
    serviceMode?: string | null;
    media?: Array<{ url: string }>;
    components?: Array<{ quantity: number; component: { isAvailable: boolean; stockUnlimited: boolean; stockQty: number | null } }>;
    variants?: Array<{
      options?: Prisma.JsonValue | null;
      id: string;
      option1Name: string | null;
      option1Value: string | null;
      option2Name: string | null;
      option2Value: string | null;
      option3Value?: string | null;
      priceCents: number;
      isAvailable: boolean;
      stockQty: number | null;
      imageUrl?: string | null;
    }>;
  }): CatalogProductView {
    const isService = product.kind === 'SERVICE';
    const isDigital = product.kind === 'DIGITAL';
    const stockless = isService || isDigital;
    const units = stockless ? Number.POSITIVE_INFINITY
      : product.components?.length ? Math.min(...product.components.map(({ quantity, component }) =>
        !component.isAvailable ? 0 : component.stockUnlimited || component.stockQty === null
          ? Number.POSITIVE_INFINITY : Math.floor(component.stockQty / Math.max(quantity, 1))))
        : product.stockUnlimited || product.stockQty === null ? Number.POSITIVE_INFINITY : product.stockQty;
    const stockLabel = isService
      ? serviceLabel(
          product.durationMinutes ?? null,
          product.serviceMode ?? null,
        )
      : isDigital
        ? 'Producto digital · acceso por enlace tras el pago'
        : !Number.isFinite(units)
        ? 'Disponible'
        : units > 0
          ? `${units} en stock`
          : 'Agotado';
    const variants = (product.variants ?? [])
      .filter((variant) => variant.isAvailable)
      .map((variant) => {
        const parts = variantOptions(variant).map((option) => option.value);
        return {
          id: variant.id,
          label: parts.join(' / ') || 'Variante',
          priceCents: variant.priceCents,
          priceLabel: moneyLabel(product.currency, variant.priceCents),
          stockLabel:
            isService || isDigital
            ? stockLabel
            : variant.stockQty == null
              ? stockLabel
              : `${variant.stockQty} en stock`,
          isAvailable: product.isAvailable && (stockless || (variant.stockQty === null ? units > 0 : variant.stockQty > 0)),
        };
      });
    const basePriceCents = variants.length ? Math.min(...variants.map((variant) => variant.priceCents)) : product.basePriceCents;
    const priceLabel = moneyLabel(product.currency, basePriceCents);
    const isAvailable = product.isAvailable && (product.variants?.length ? variants.some((variant) => variant.isAvailable) : units > 0);
    return {
      id: product.id,
      handle: product.handle,
      name: product.name,
      brand: product.brand ?? null,
      descriptionShort: product.descriptionShort,
      descriptionFull:
        product.descriptionFull?.trim().slice(0, DESCRIPTION_FULL_MAX_CHARS) ||
        null,
      line: product.line ?? null,
      facts: productFacts(product.details),
      keywords: productKeywords(product.details),
      basePriceCents,
      compareAtPriceLabel:
        product.compareAtPriceCents &&
        product.compareAtPriceCents > product.basePriceCents
          ? moneyLabel(product.currency, product.compareAtPriceCents)
          : null,
      currency: product.currency,
      categories: product.categories,
      isAvailable,
      stockUnlimited: product.stockUnlimited,
      stockQty: product.stockQty,
      stockLabel: !stockless && product.variants?.length ? (isAvailable ? 'Disponible en variantes' : 'Agotado') : stockLabel,
      priceLabel,
      isService,
      isDigital,
      productUrl: null,
      imageUrl:
        product.media?.[0]?.url ??
        product.variants?.find((variant) => variant.imageUrl)?.imageUrl ??
        null,
      variants,
    };
  }
}
