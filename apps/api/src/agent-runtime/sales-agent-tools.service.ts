import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import {
  DEFAULT_STOREFRONT_URL_TEMPLATE,
  storefrontUrl,
} from '../storefront/storefront-host';
import { normalizeText } from './conversation-context';

/**
 * Product references written by the store: `Ref: P-{handle}` on product pages and
 * `• {qty} × {name} — {total} [P-{handle}:{variantId}]` per cart line.
 */
const CART_LINE = /^\s*•\s*(\d{1,3})\s*[×x]\s.*\[P-([a-z0-9][a-z0-9-]{0,99})(?::([a-z0-9]{10,40}))?\]\s*$/gim;
const PRODUCT_REF = /\bP-([a-z0-9][a-z0-9-]{0,99})/gi;
const MAX_REFS = 10;
/** Words that say what the buyer wants to do, not which product they mean. */
const STOPWORDS = new Set([
  'hola', 'buenas', 'buenos', 'dias', 'tardes', 'noches', 'gracias', 'quiero', 'queria',
  'quisiera', 'comprar', 'compro', 'comprarlo', 'comprarla', 'busco', 'buscando', 'necesito',
  'tienes', 'tienen', 'tiene', 'hay', 'venden', 'vendes', 'para', 'por', 'como', 'cuanto',
  'cuesta', 'precio', 'una', 'uno', 'unos', 'unas', 'los', 'las', 'del', 'que', 'con', 'sin',
  'este', 'esta', 'ese', 'esa', 'eso', 'algo', 'mas', 'favor', 'porfa', 'interesa', 'ver',
  'pedido', 'pagar', 'link', 'pago', 'foto', 'fotos', 'imagen',
]);

/** Words that ask to browse the catalog rather than naming what to look for. */
const BROWSE_WORDS = new Set([
  'catalogo', 'producto', 'productos', 'opcion', 'opciones', 'muestrame', 'muestra', 'ensename',
  'mostrar', 'otros', 'otras', 'otro', 'otra', 'siguiente', 'siguientes', 'recomiendame',
  'recomienda', 'recomiendas', 'recomendacion', 'recomendaciones', 'ofrecen', 'todo', 'todos',
  'disponible', 'disponibles', 'modelos',
]);
const BROWSE_WINDOW = 3;
/** Same "featured" order as the web store. */
const FEATURED_ORDER = [{ sortOrder: 'asc' as const }, { updatedAt: 'desc' as const }];
const PRODUCT_VIEW_INCLUDE = {
  variants: true,
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
  | 'escalate';

export type AgentToolTrace = {
  name: AgentToolName;
  status: 'ok' | 'error' | 'skipped';
  summary: string;
  data?: Record<string, unknown>;
};

export type CatalogProductView = {
  id: string;
  handle: string;
  name: string;
  descriptionShort: string | null;
  basePriceCents: number;
  currency: string;
  categories: string[];
  isAvailable: boolean;
  stockUnlimited: boolean;
  stockQty: number | null;
  stockLabel: string;
  priceLabel: string;
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
        refs.set(`${handle}:`, { handle, variantId: null, quantity: 1, fromCart: false });
      }
    }
    return [...refs.values()].slice(0, MAX_REFS);
  }

  /**
   * Recent available products plus any product the buyer referenced explicitly or the
   * seller already recommended in this chat (`contextIds`).
   */
  async listAvailableProducts(
    tenantId: string,
    referencedHandles: string[] = [],
    contextIds: string[] = [],
  ): Promise<CatalogProductView[]> {
    const pinned = [
      ...(referencedHandles.length ? [{ handle: { in: referencedHandles } }] : []),
      ...(contextIds.length ? [{ id: { in: contextIds } }] : []),
    ];
    const [products, referenced, base] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId, isAvailable: true },
        include: PRODUCT_VIEW_INCLUDE,
        take: 40,
        orderBy: FEATURED_ORDER,
      }),
      pinned.length
        ? this.prisma.product.findMany({
            where: { tenantId, isAvailable: true, OR: pinned },
            include: PRODUCT_VIEW_INCLUDE,
          })
        : Promise.resolve([]),
      this.storeBase(tenantId),
    ]);
    const byId = new Map([...referenced, ...products].map((product) => [product.id, product]));
    return [...byId.values()].map((product) => this.toStoreView(product, base));
  }

  /** Category counts of the whole available catalog, used to summarize it instead of listing it. */
  async catalogOverview(tenantId: string): Promise<CatalogOverview> {
    const [rows, storeUrl] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId, isAvailable: true },
        select: { categories: true },
        take: 2000,
      }),
      this.storeBase(tenantId),
    ]);
    const byKey = new Map<string, CatalogOverview['categories'][number]>();
    for (const row of rows) {
      for (const name of new Set(row.categories.map((item) => item.trim()).filter(Boolean))) {
        const key = normalizeText(name);
        const entry = byKey.get(key) ?? { label: name, names: [], count: 0 };
        if (!entry.names.includes(name)) entry.names.push(name);
        entry.count += 1;
        byKey.set(key, entry);
      }
    }
    return {
      total: rows.length,
      categories: [...byKey.values()].sort((a, b) => b.count - a.count),
      storeUrl,
    };
  }

  /**
   * Whether the buyer asks to browse ("ver el catálogo", "tienen perfumes?", "ver más")
   * rather than naming a product. Any extra descriptive word ("perfume floral") keeps the
   * regular search, which ranks by those words.
   */
  browseRequest(text: string, overview: CatalogOverview): BrowseRequest | null {
    const normalized = normalizeText(text);
    const tokens = queryTokens(text).filter((token) => !BROWSE_WORDS.has(token));
    if (/\b(ver mas|mas opciones|otr[oa]s|que mas (tienen|hay)|mas productos|siguientes)\b/.test(normalized) && !tokens.length) {
      return { kind: 'more' };
    }
    const scored = overview.categories
      .map((category) => {
        const words = category.names.flatMap(wordsOf);
        return { category, hits: tokens.filter((token) => words.some((word) => sameWord(token, word))) };
      })
      .filter((item) => item.hits.length > 0)
      .sort((a, b) => b.hits.length - a.hits.length || b.category.count - a.category.count);
    const best = scored[0];
    if (best && tokens.every((token) => best.hits.includes(token))) {
      return { kind: 'category', category: best.category };
    }
    const asksCatalog =
      /\b(productos?|catalogo|que (tienen|venden|hay|ofrecen)|recomiend\w*|opciones|muestrame|ensename)\b/.test(normalized);
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
      ...(options.categoryNames?.length ? { categories: { hasSome: options.categoryNames } } : {}),
      ...(options.excludeIds?.length ? { id: { notIn: options.excludeIds } } : {}),
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
    return storefront?.status === 'PUBLISHED'
      ? storefrontUrl(
          this.config.get<string>('STOREFRONT_URL_TEMPLATE') ?? DEFAULT_STOREFRONT_URL_TEMPLATE,
          storefront.tenant.slug,
        ).replace(/\/$/, '')
      : null;
  }

  private toStoreView(
    product: Parameters<SalesAgentToolsService['toView']>[0] & { isPublishedOnStore: boolean },
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
          data: { matchIds: referenced.map((item) => item.id), count: referenced.length, byReference: true },
        },
      };
    }

    let matches = products
      .map((product) => {
        const haystack = normalizeText(
          [
            product.name,
            product.handle,
            product.descriptionShort ?? '',
            product.categories.join(' '),
            ...product.variants.flatMap((variant) => [
              variant.label,
              variant.priceLabel,
            ]),
          ].join(' '),
        );
        const score = tokens.reduce(
          (acc, token) => (wordForms(token).some((form) => haystack.includes(form)) ? acc + 1 : acc),
          0,
        );
        return { product, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => item.product);

    const asksCatalog =
      /productos?|catalogo|que\s+tienen|que\s+venden|recomend/.test(query);
    if (!matches.length && asksCatalog && products.length) {
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
        const haystack = `${faq.question} ${faq.answer} ${faq.tags.join(' ')}`.toLowerCase();
        const score = tokens.reduce(
          (acc, token) => (haystack.includes(token) ? acc + 1 : acc),
          0,
        );
        const questionBoost = tokens.some((token) =>
          faq.question.toLowerCase().includes(token),
        )
          ? 2
          : 0;
        return { faq, score: score + questionBoost };
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
  orderLinesFromRefs(refs: ProductRef[], products: CatalogProductView[]): OrderLine[] {
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

  async createOrderWithOptionalLink(params: {
    tenantId: string;
    mode: AgentRuntimeMode;
    lines: OrderLine[];
    conversationId?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    createPaymentLink: boolean;
  }): Promise<{
    traces: AgentToolTrace[];
    orderId?: string;
    checkoutUrl?: string;
    dryRun: boolean;
  }> {
    const lines = params.lines.map((line) => ({
      ...line,
      quantity: Math.max(1, line.quantity),
      unitCents: line.variant?.priceCents ?? line.product.basePriceCents,
      title: line.variant ? `${line.product.name} (${line.variant.label})` : line.product.name,
    }));
    const totalCents = lines.reduce((sum, line) => sum + line.quantity * line.unitCents, 0);
    const currency = lines[0].product.currency;
    const label = lines.map((line) => `${line.quantity}× ${line.title}`).join(', ');

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
      const order = await this.ordersService.create(params.tenantId, {
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
      });

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

  escalateTrace(reason: string): AgentToolTrace {
    return {
      name: 'escalate',
      status: 'ok',
      summary: `Escalado a humano: ${reason}`,
      data: { reason },
    };
  }

  wantsHuman(text: string): boolean {
    return /humano|asesor|persona|agent(e|a)?\s+humano|hablar con alguien|atenci[oó]n\s+humana/.test(
      text.toLowerCase(),
    );
  }

  wantsPurchase(text: string): boolean {
    return /comprar|hacer\s+(un|el|mi|este)\s+pedido|pagar|checkout|link\s+de\s+pago|quiero\s+(ese|este|esa|esta|el|la)\b|lo\s+quiero|la\s+quiero|me\s+lo\s+llevo|me\s+la\s+llevo/.test(
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
    const referenced = new Set(
      refs.map((ref) => products.find((product) => product.handle === ref.handle)).filter(Boolean),
    );
    if (referenced.size) {
      return referenced.size === 1 ? ([...referenced][0] as CatalogProductView) : null;
    }
    const names = products.map((product) => ({ product, words: wordsOf(product.name) }));
    const hits = new Set<CatalogProductView>();
    for (const token of queryTokens(text)) {
      const owners = names.filter((item) => item.words.some((word) => sameWord(token, word)));
      if (owners.length === 1) hits.add(owners[0].product);
    }
    return hits.size === 1 ? [...hits][0] : null;
  }

  private toView(product: {
    id: string;
    handle: string;
    name: string;
    descriptionShort: string | null;
    basePriceCents: number;
    currency: string;
    categories: string[];
    isAvailable: boolean;
    stockUnlimited: boolean;
    stockQty: number | null;
    media?: Array<{ url: string }>;
    variants?: Array<{
      id: string;
      option1Name: string | null;
      option1Value: string | null;
      option2Name: string | null;
      option2Value: string | null;
      priceCents: number;
      isAvailable: boolean;
      stockQty: number | null;
      imageUrl?: string | null;
    }>;
  }): CatalogProductView {
    const priceLabel = `${product.currency} ${(product.basePriceCents / 100).toFixed(2)}`;
    const stockLabel = product.stockUnlimited
      ? 'Disponible'
      : `${product.stockQty ?? 0} en stock`;
    const variants = (product.variants ?? [])
      .filter((variant) => variant.isAvailable)
      .map((variant) => {
        const parts = [
          variant.option1Value,
          variant.option2Value,
        ].filter(Boolean);
        return {
          id: variant.id,
          label: parts.join(' / ') || 'Variante',
          priceCents: variant.priceCents,
          priceLabel: `${product.currency} ${(variant.priceCents / 100).toFixed(2)}`,
          stockLabel:
            variant.stockQty == null
              ? 'Stock no tipado'
              : `${variant.stockQty} en stock`,
          isAvailable: variant.isAvailable,
        };
      });
    return {
      id: product.id,
      handle: product.handle,
      name: product.name,
      descriptionShort: product.descriptionShort,
      basePriceCents: product.basePriceCents,
      currency: product.currency,
      categories: product.categories,
      isAvailable: product.isAvailable,
      stockUnlimited: product.stockUnlimited,
      stockQty: product.stockQty,
      stockLabel,
      priceLabel,
      productUrl: null,
      imageUrl:
        product.media?.[0]?.url ??
        product.variants?.find((variant) => variant.imageUrl)?.imageUrl ??
        null,
      variants,
    };
  }
}
