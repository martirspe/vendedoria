import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  allRecommendedProductIds,
  awaitingDelivery,
  conversationalIntent,
  ConversationTurn,
  HISTORY_LIMIT,
  lastBrowse,
  lastRecommendedProductIds,
  normalizeText,
  toWhatsAppText,
  wantsPhoto,
  withoutLink,
} from './conversation-context';
import { DeliveryPlan, planDelivery } from './delivery-plan';
import {
  AgentRuntimeMode,
  AgentToolTrace,
  CatalogOverview,
  CatalogProductView,
  moneyLabel,
  OrderLine,
  placeLabel,
  SalesAgentToolsService,
} from './sales-agent-tools.service';
import {
  AgentPersonality,
  buildAgentPrompt,
  toPersonality,
} from './sales-playbook';

/** How a catalog browse is presented in the reply. */
type BrowseView = {
  /** `overview`: categories only (large catalog); `page`: the next few products. */
  mode: 'overview' | 'page';
  products: CatalogProductView[];
  category: string | null;
  remaining: number;
  overview: CatalogOverview;
};

const BROWSE_PAGE = 3;

function journeyGuide(journeys: Array<{ stage: string }>): string {
  return journeys.length
    ? 'journeyScripts son guiones del negocio por etapa (DISCOVER descubrir, RECOMMEND recomendar, CLOSE cerrar, SUPPORT postventa): usa el de la etapa actual de la conversación como guía, con tus palabras.'
    : '';
}

/** Photo of a recommended product, sent as its own message after the reply. */
export type AgentProductImage = {
  productId: string;
  imageUrl: string;
  caption: string;
};

export type AgentReplyResult = {
  /** Never contains `checkoutUrl`: the channel sends the payment link with the text (a button on WhatsApp). */
  replyText: string;
  escalate: boolean;
  usedCatalog: boolean;
  pauseOnHandoff: boolean;
  tools: AgentToolTrace[];
  images: AgentProductImage[];
  orderId?: string;
  /** Order reference shown next to the payment button. */
  orderRef?: string;
  checkoutUrl?: string;
  /** The reply was written by OpenAI (counts toward the plan's AI replies). */
  usedAi?: boolean;
};

type ReplyParams = {
  tenantId: string;
  /** Explicit agent (playground); otherwise the channel's agent, else the primary one. */
  agentId?: string | null;
  channelId?: string | null;
  conversationId?: string | null;
  inboundText: string;
  mode?: AgentRuntimeMode;
  customerName?: string | null;
  customerPhone?: string | null;
  /** Earlier turns of this chat, oldest first, without the current message. */
  history?: ConversationTurn[];
  shownImageProductIds?: string[];
  /** False when the plan's AI replies for the month are used: the deterministic reply is used. */
  allowAi?: boolean;
};

/** What the reply must resolve before an order can be created. */
type PendingChoice =
  | { kind: 'product' }
  | { kind: 'variant'; product: CatalogProductView }
  | { kind: 'delivery'; question: string }
  | null;

/** Order lines with the delivery step of this turn, already worded from real settings. */
type DeliveryText = {
  /** Price breakdown shown before the payment link. */
  summary: string | null;
  /** Note after the link (delivery coordinated in the chat, address still needed). */
  note: string | null;
};

const SHIPPING_RULE =
  'Nunca inventes costos ni tiempos de envío: el costo se calcula con el distrito del cliente cuando confirma la compra.';

const SERVICE_RULE =
  'Los servicios no se envían ni llevan stock. Puedes preguntar qué día u horario prefiere el cliente, pero nunca confirmes una fecha ni una hora: el negocio la confirma después del pago.';
const SERVICE_SCHEDULE_NOTE =
  'Después del pago te escribimos para coordinar el día y la hora del servicio.';

const MAX_IMAGES = 3;
/** A WhatsApp reply needs ~150 tokens; the cap bounds the cost of a runaway answer. */
const MAX_OUTPUT_TOKENS = 600;
const LOW_STOCK_UNITS = 5;

type FaqMatch = { id: string; question: string; answer: string };
type JourneyView = {
  title: string;
  stage: string;
  scriptText: string;
};

@Injectable()
export class SalesAgentRuntimeService {
  private readonly logger = new Logger(SalesAgentRuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tools: SalesAgentToolsService,
    private readonly knowledge: KnowledgeService,
  ) {}

  async generateReply(params: ReplyParams): Promise<AgentReplyResult> {
    const result = await this.composeReply(params);
    const text = result.checkoutUrl
      ? withoutLink(result.replyText, result.checkoutUrl)
      : result.replyText;
    return { ...result, replyText: toWhatsAppText(text) };
  }

  private async composeReply(params: ReplyParams): Promise<AgentReplyResult> {
    const mode = params.mode ?? 'production';
    const history = (params.history ?? []).slice(-HISTORY_LIMIT);
    const firstTurn = !history.some((turn) => turn.role === 'agent');
    const pendingLines = awaitingDelivery(history);
    const contextIds = [
      ...new Set([
        ...lastRecommendedProductIds(history),
        ...pendingLines.map((line) => line.productId),
      ]),
    ];
    const refs = this.tools.extractProductRefs(params.inboundText);
    const [agentRow, products, runtimeKnowledge, overview] = await Promise.all([
      this.resolveAgent(params.tenantId, params.agentId, params.channelId),
      this.tools.listAvailableProducts(
        params.tenantId,
        refs.map((ref) => ref.handle),
        contextIds,
      ),
      this.knowledge.getRuntimeKnowledge(params.tenantId),
      this.tools.catalogOverview(params.tenantId),
    ]);

    const agent = toPersonality(agentRow);

    if (!agent.isActive && mode === 'production') {
      return {
        replyText:
          'El vendedor IA está pausado. Un humano te atenderá en breve.',
        escalate: true,
        usedCatalog: false,
        pauseOnHandoff: true,
        tools: [this.tools.escalateTrace('vendedor inactivo')],
        images: [],
      };
    }

    const openAiKey =
      params.allowAi === false
        ? undefined
        : this.config.get<string>('OPENAI_API_KEY');
    const intent = conversationalIntent(params.inboundText);
    if (
      intent === 'closing' ||
      (intent === 'acknowledgement' && !firstTurn && !openAiKey)
    ) {
      return {
        replyText: this.applyTone(
          agent,
          intent === 'closing'
            ? this.closingText(params.customerName, history)
            : '¡Perfecto! ¿Te ayudo con algo más?',
        ),
        escalate: false,
        usedCatalog: false,
        pauseOnHandoff: agent.pauseOnHandoff,
        tools: [],
        images: [],
      };
    }

    const traces: AgentToolTrace[] = [];
    const search = this.tools.searchCatalog(params.inboundText, products, refs);
    let matches = search.matches;
    let searchTrace = search.trace;
    const contextProducts = contextIds
      .map((id) => products.find((product) => product.id === id))
      .filter((product): product is CatalogProductView => Boolean(product));
    const browse =
      refs.length || this.tools.wantsPurchase(params.inboundText)
        ? null
        : await this.resolveBrowse(
            params.tenantId,
            params.inboundText,
            overview,
            history,
          );
    if (browse) {
      matches = browse.view.products;
      searchTrace = browse.trace;
    }
    const fromContext =
      !browse && !matches.length && contextProducts.length > 0;
    if (fromContext) {
      matches = contextProducts.slice(0, 3);
      searchTrace = {
        name: 'search_catalog',
        status: 'ok',
        summary: `Producto de la conversación: ${matches.map((item) => item.name).join(', ')}`,
        data: {
          matchIds: matches.map((item) => item.id),
          count: matches.length,
          fromConversation: true,
        },
      };
    }

    let orderId: string | undefined;
    let orderRef: string | undefined;
    let checkoutUrl: string | undefined;
    let pending: PendingChoice = null;
    const cartLines = this.tools.orderLinesFromRefs(refs, products);
    let lines: OrderLine[] = [];
    if (
      this.tools.wantsPurchase(params.inboundText) &&
      !this.tools.wantsHuman(params.inboundText)
    ) {
      lines = cartLines;
      if (!lines.length) {
        const target =
          this.tools.identifyProduct(params.inboundText, products, refs) ??
          (search.matches.length === 1 ? search.matches[0] : null) ??
          (fromContext && contextProducts.length === 1
            ? contextProducts[0]
            : null);
        if (!target) {
          pending = matches.length ? { kind: 'product' } : null;
        } else {
          matches = [target];
          const text = normalizeText(params.inboundText);
          const variant =
            target.variants.length === 1
              ? target.variants[0]
              : target.variants.find((item) =>
                  text.includes(normalizeText(item.label)),
                );
          if (target.variants.length > 1 && !variant) {
            pending = { kind: 'variant', product: target };
          } else {
            lines = [{ product: target, variant, quantity: 1 }];
          }
        }
        searchTrace = {
          ...searchTrace,
          data: {
            ...searchTrace.data,
            matchIds: matches.map((item) => item.id),
            count: matches.length,
          },
        };
      }
    }

    let delivery: DeliveryPlan | null = null;
    if (
      !lines.length &&
      !pending &&
      pendingLines.length &&
      !this.tools.wantsHuman(params.inboundText)
    ) {
      const resumed = this.tools.orderLinesFromPending(pendingLines, products);
      if (resumed.length) {
        const plan = planDelivery({
          rules: await this.tools.shippingRules(params.tenantId),
          text: params.inboundText,
          subtotalCents: this.tools.subtotalCents(resumed),
        });
        if (plan.kind !== 'ask' || plan.candidates.length) {
          lines = resumed;
          delivery = plan;
          matches = resumed.map((line) => line.product);
          searchTrace = {
            ...searchTrace,
            data: {
              ...searchTrace.data,
              matchIds: matches.map((item) => item.id),
              count: matches.length,
            },
          };
        }
      }
    } else if (
      lines.length &&
      !cartLines.length &&
      lines.some((line) => !line.product.isService)
    ) {
      delivery = planDelivery({
        rules: await this.tools.shippingRules(params.tenantId),
        text: params.inboundText,
        subtotalCents: this.tools.subtotalCents(lines),
        ignore: lines.flatMap((line) =>
          [line.product.name, line.variant?.label ?? '']
            .flatMap((name) => name.split(/\s+/))
            .filter((word) => word.length > 3),
        ),
      });
    }
    if (delivery?.kind === 'ask') {
      pending = { kind: 'delivery', question: this.deliveryQuestion(delivery) };
    }
    traces.push(searchTrace);

    for (const match of matches.slice(0, 2)) {
      traces.push(this.tools.getAvailability(match));
    }

    const { matches: faqMatches, trace: faqTrace } = this.tools.lookupFaqs(
      params.inboundText,
      runtimeKnowledge.faqs,
    );
    traces.push(faqTrace);

    const journeys: JourneyView[] = runtimeKnowledge.journeys.map((item) => ({
      title: item.title,
      stage: item.stage,
      scriptText: item.scriptText,
    }));

    if (this.tools.wantsHuman(params.inboundText)) {
      traces.push(this.tools.escalateTrace('solicitud del comprador'));
      return {
        escalate: true,
        usedCatalog: matches.length > 0,
        pauseOnHandoff: agent.pauseOnHandoff,
        tools: traces,
        images: [],
        replyText:
          agent.handoffMessage ??
          'Te conectaré con un agente humano para brindarte más ayuda.',
      };
    }

    if (lines.length && delivery) {
      traces.push(this.tools.deliveryTrace(delivery, lines));
    }
    let deliveryText: DeliveryText = { summary: null, note: null };
    if (lines.length && delivery?.kind !== 'ask') {
      const commerce = await this.tools.createOrderWithOptionalLink({
        tenantId: params.tenantId,
        mode,
        lines,
        conversationId: params.conversationId,
        customerName: params.customerName,
        customerPhone: params.customerPhone,
        createPaymentLink: !cartLines.length,
        delivery: delivery?.kind === 'quote' ? delivery : undefined,
      });
      traces.push(...commerce.traces);
      orderId = commerce.orderId;
      orderRef = commerce.orderRef;
      checkoutUrl = commerce.checkoutUrl;
      if (checkoutUrl && delivery) {
        deliveryText = this.deliveryText(delivery, lines);
      }
      if (checkoutUrl && lines.some((line) => line.product.isService)) {
        deliveryText = {
          ...deliveryText,
          note: [deliveryText.note, SERVICE_SCHEDULE_NOTE]
            .filter(Boolean)
            .join('\n'),
        };
      }
    }
    const cartOrder = cartLines.length > 0 && Boolean(orderId);

    const photoAsked = wantsPhoto(params.inboundText);
    const images = cartOrder
      ? []
      : this.pickImages(
          fromContext && !photoAsked ? [] : matches,
          params.shownImageProductIds ?? [],
          photoAsked,
        );

    if (openAiKey) {
      try {
        const ai = await this.generateWithOpenAi({
          apiKey: openAiKey,
          model: this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini'),
          agent,
          inboundText: params.inboundText,
          history,
          firstTurn,
          catalogMatches: matches,
          faqMatches,
          journeys,
          checkoutUrl,
          deliveryText,
          cartOrder,
          pending,
          browse: browse?.view ?? null,
          sendsPhotos: images.length > 0,
          mode,
        });
        if (ai) {
          return {
            ...ai,
            pauseOnHandoff: agent.pauseOnHandoff,
            tools: traces,
            images,
            orderId,
            orderRef,
            checkoutUrl,
            usedAi: true,
          };
        }
      } catch (error) {
        this.logger.warn(
          `OpenAI failed, using deterministic fallback: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }
    }

    return {
      ...this.deterministicReply({
        agent,
        inboundText: params.inboundText,
        firstTurn,
        catalogMatches: matches,
        faqMatches,
        journeys,
        checkoutUrl,
        deliveryText,
        cartOrder,
        pending,
        browse: browse?.view ?? null,
        mode,
      }),
      tools: traces,
      images,
      orderId,
      orderRef,
      checkoutUrl,
    };
  }

  /**
   * Catalog browsing without dumping it: a large catalog is summarized by category first;
   * a category or "ver más" shows the next few products not yet shown in this chat.
   */
  private async resolveBrowse(
    tenantId: string,
    text: string,
    overview: CatalogOverview,
    history: ConversationTurn[],
  ): Promise<{ view: BrowseView; trace: AgentToolTrace } | null> {
    const request = this.tools.browseRequest(text, overview);
    if (!request) return null;

    if (
      request.kind === 'catalog' &&
      overview.categories.length >= 2 &&
      overview.total > BROWSE_PAGE
    ) {
      return {
        view: {
          mode: 'overview',
          products: [],
          category: null,
          remaining: overview.total,
          overview,
        },
        trace: {
          name: 'search_catalog',
          status: 'ok',
          summary: `Resumen del catálogo: ${overview.total} productos en ${overview.categories.length} categorías`,
          data: { matchIds: [], count: 0, browse: true, browseCategory: null },
        },
      };
    }

    let category: CatalogOverview['categories'][number] | undefined;
    let excludeIds: string[] = [];
    if (request.kind === 'category') {
      category = request.category;
    } else if (request.kind === 'more') {
      const previous = lastBrowse(history)?.category;
      category = previous
        ? overview.categories.find(
            (item) => normalizeText(item.label) === normalizeText(previous),
          )
        : undefined;
      excludeIds = allRecommendedProductIds(history);
    }
    const page = await this.tools.browseProducts(tenantId, {
      categoryNames: category?.names,
      excludeIds,
    });
    const label = category?.label ?? null;
    return {
      view: {
        mode: 'page',
        products: page.products,
        category: label,
        remaining: page.remaining,
        overview,
      },
      trace: {
        name: 'search_catalog',
        status: page.products.length ? 'ok' : 'skipped',
        summary: page.products.length
          ? `Catálogo${label ? ` · ${label}` : ''}: ${page.products.map((item) => item.name).join(', ')}${page.remaining ? ` (+${page.remaining} más)` : ''}`
          : `Ya se mostraron todos los productos${label ? ` de ${label}` : ''}`,
        data: {
          matchIds: page.products.map((item) => item.id),
          count: page.products.length,
          browse: true,
          browseCategory: label,
          remaining: page.remaining,
        },
      },
    };
  }

  /** Photos of the recommended products the buyer has not seen in this chat yet. */
  private pickImages(
    products: CatalogProductView[],
    shownProductIds: string[],
    force: boolean,
  ): AgentProductImage[] {
    const shown = new Set(shownProductIds);
    return products
      .filter(
        (product) => product.imageUrl && (force || !shown.has(product.id)),
      )
      .slice(0, MAX_IMAGES)
      .map((product) => ({
        productId: product.id,
        imageUrl: product.imageUrl as string,
        caption: this.photoCaption(product),
      }));
  }

  /** WhatsApp photo caption: bold name, then price and availability as the buyer reads them. */
  private photoCaption(product: CatalogProductView): string {
    const prices = [...new Set(product.variants.map((variant) => variant.priceCents))];
    const price = !prices.length
      ? product.priceLabel
      : `${prices.length > 1 ? 'Desde ' : ''}${moneyLabel(product.currency, Math.min(...prices))}`;
    const units = product.stockQty ?? 0;
    const availability = product.isService
      ? product.stockLabel
      : !product.stockUnlimited && units > 0 && units <= LOW_STOCK_UNITS
        ? units === 1
          ? 'Última unidad'
          : `Últimas ${units} unidades`
        : 'Disponible';
    return `*${product.name}*\n${price} · ${availability}`;
  }

  private closingText(
    customerName: string | null | undefined,
    history: ConversationTurn[],
  ): string {
    const firstName = customerName?.trim().split(/\s+/)[0];
    const thanks = `¡Gracias a ti${firstName ? `, ${firstName}` : ''}!`;
    const awaitingPayment = history
      .slice(-4)
      .some(
        (turn) =>
          turn.role === 'agent' &&
          (turn.paymentLink ||
            (/https?:\/\//.test(turn.text) && /pago/i.test(turn.text))),
      );
    return awaitingPayment
      ? `${thanks} Cuando completes el pago te confirmamos por aquí.`
      : `${thanks} Aquí estaré si necesitas algo más.`;
  }

  private async resolveAgent(
    tenantId: string,
    agentId?: string | null,
    channelId?: string | null,
  ) {
    if (agentId) {
      const agent = await this.prisma.salesAgent.findFirst({
        where: { id: agentId, tenantId },
      });
      if (agent) return agent;
    }
    if (channelId) {
      const channel = await this.prisma.channel.findFirst({
        where: { id: channelId, tenantId },
        select: { salesAgent: true },
      });
      if (channel?.salesAgent?.tenantId === tenantId) return channel.salesAgent;
    }
    return this.prisma.salesAgent.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Asks where to deliver, offering pickup when the business has it. */
  private deliveryQuestion(
    plan: Extract<DeliveryPlan, { kind: 'ask' }>,
  ): string {
    const pickup = plan.pickupAddress
      ? `\nSi prefieres, puedes recogerlo gratis en ${plan.pickupAddress}.`
      : '';
    if (plan.candidates.length) {
      const options = plan.candidates
        .map(
          (place) =>
            `• ${place.district} (${place.province}, ${place.department})`,
        )
        .join('\n');
      return `Hay varios distritos con ese nombre:\n${options}\n¿Cuál es el tuyo? Escríbeme el distrito y la provincia.${pickup}`;
    }
    return `Para calcular el envío, ¿a qué distrito te lo enviamos? Escríbeme el distrito y la provincia, por ejemplo: Miraflores, Lima.${pickup}`;
  }

  /** Price breakdown and delivery note from the plan used to create the order. */
  private deliveryText(plan: DeliveryPlan, lines: OrderLine[]): DeliveryText {
    if (plan.kind === 'none') {
      return {
        summary: null,
        note: 'La entrega la coordinamos contigo por este chat.',
      };
    }
    if (plan.kind !== 'quote') return { summary: null, note: null };
    const currency = lines[0].product.currency;
    const subtotal = this.tools.subtotalCents(lines);
    const { charge } = plan;
    const cost = charge.free ? 'gratis' : moneyLabel(currency, charge.cents);
    const shippingLine =
      charge.mode === 'PICKUP'
        ? `Recojo en tienda: gratis${plan.pickupAddress ? ` (${plan.pickupAddress})` : ''}`
        : `Envío con ${charge.label}${plan.place ? ` a ${placeLabel(plan.place)}` : ''}: ${cost}`;
    const summary = [
      '*Resumen de tu pedido*',
      `Productos: ${moneyLabel(currency, subtotal)}`,
      shippingLine,
      `*Total: ${moneyLabel(currency, subtotal + charge.cents)}*`,
    ].join('\n');
    const note =
      charge.mode !== 'PICKUP' && !plan.address
        ? 'Después del pago, envíanos tu dirección exacta y una referencia para el despacho.'
        : null;
    return { summary, note };
  }

  private deterministicReply(params: {
    agent: AgentPersonality;
    inboundText: string;
    firstTurn: boolean;
    catalogMatches: CatalogProductView[];
    faqMatches: FaqMatch[];
    journeys: JourneyView[];
    checkoutUrl?: string;
    deliveryText: DeliveryText;
    cartOrder: boolean;
    pending: PendingChoice;
    browse: BrowseView | null;
    mode: AgentRuntimeMode;
  }): Omit<AgentReplyResult, 'tools' | 'images' | 'orderId' | 'checkoutUrl'> {
    const { agent } = params;

    if (params.cartOrder) {
      const lines = params.catalogMatches.map((product) => `• ${product.name}`);
      return {
        escalate: false,
        usedCatalog: true,
        pauseOnHandoff: agent.pauseOnHandoff,
        replyText: this.applyTone(
          agent,
          `¡Gracias! Registré tu pedido de la tienda web:\n${lines.join('\n')}\nEn breve te confirmamos stock, costo de envío y forma de pago.`,
        ),
      };
    }

    if (params.checkoutUrl) {
      const confirm =
        agent.purchaseConfirmMessage ??
        'Perfecto. Aquí tienes el link de pago para completar tu compra:';
      const dryNote =
        params.mode === 'playground'
          ? '(Prueba: este link es simulado y no aparece en Pedidos.)'
          : null;
      const { summary, note } = params.deliveryText;
      return {
        escalate: false,
        usedCatalog: true,
        pauseOnHandoff: agent.pauseOnHandoff,
        replyText: this.applyTone(
          agent,
          [summary, note, dryNote, confirm].filter(Boolean).join('\n\n'),
          { keepLines: true },
        ),
      };
    }

    if (params.pending?.kind === 'delivery') {
      return {
        escalate: false,
        usedCatalog: true,
        pauseOnHandoff: agent.pauseOnHandoff,
        replyText: this.applyTone(
          agent,
          `¡Buena elección! ${params.pending.question}`,
          { keepLines: true },
        ),
      };
    }

    if (params.pending?.kind === 'variant') {
      const { product } = params.pending;
      const options = product.variants
        .map((variant) => `• ${variant.label} — ${variant.priceLabel}`)
        .join('\n');
      return {
        escalate: false,
        usedCatalog: true,
        pauseOnHandoff: agent.pauseOnHandoff,
        replyText: this.applyTone(
          agent,
          `¡Buena elección! ¿Qué opción de ${product.name} prefieres?\n${options}`,
        ),
      };
    }

    const { browse } = params;
    const storeLink = browse?.overview.storeUrl
      ? `\nCatálogo completo: ${browse.overview.storeUrl}`
      : '';
    if (browse?.mode === 'overview') {
      const categories = browse.overview.categories
        .slice(0, 8)
        .map((item) => `• ${item.label} (${item.count})`)
        .join('\n');
      const greeting = params.firstTurn
        ? `¡Hola! Soy ${agent.name} de ${agent.companyName}. `
        : '';
      return {
        escalate: false,
        usedCatalog: true,
        pauseOnHandoff: agent.pauseOnHandoff,
        replyText: this.applyTone(
          agent,
          `${greeting}Tenemos ${browse.overview.total} productos disponibles:\n${categories}${storeLink}\n¿Qué estás buscando? Cuéntame y te recomiendo las mejores opciones.`,
        ),
      };
    }
    if (browse?.mode === 'page' && !browse.products.length) {
      return {
        escalate: false,
        usedCatalog: true,
        pauseOnHandoff: agent.pauseOnHandoff,
        replyText: this.applyTone(
          agent,
          `Ya te mostré todas las opciones${browse.category ? ` de ${browse.category}` : ''}.${storeLink}\n¿Alguna te gustó? Te ayudo a elegir.`,
        ),
      };
    }

    if (params.faqMatches.length > 0 && params.catalogMatches.length === 0) {
      const faq = params.faqMatches[0];
      return {
        escalate: false,
        usedCatalog: false,
        pauseOnHandoff: agent.pauseOnHandoff,
        replyText: this.applyTone(
          agent,
          `${faq.answer}\n\nSi quieres, también te ayudo a elegir un producto del catálogo.`,
        ),
      };
    }

    if (params.catalogMatches.length > 0) {
      const lines = params.catalogMatches.map((product) => {
        const blurb = product.descriptionShort
          ? ` — ${product.descriptionShort}`
          : '';
        const variants = product.variants.length
          ? `\n  Variantes: ${product.variants
              .slice(0, 3)
              .map((variant) => `${variant.label} ${variant.priceLabel}`)
              .join('; ')}`
          : '';
        const url = product.productUrl ? `\n  Ver: ${product.productUrl}` : '';
        return `• ${product.name} (${product.priceLabel}, ${product.stockLabel})${blurb}${variants}${url}`;
      });
      const faqNote = params.faqMatches[0]
        ? `\n\nTambién: ${params.faqMatches[0].answer}`
        : '';
      const [first, second] = params.catalogMatches;
      const closeHint =
        params.pending?.kind === 'product'
          ? '¿Cuál de estas opciones te gustaría? Te preparo el link de pago.'
          : (params.journeys.find((item) => item.stage === 'CLOSE')
              ?.scriptText ??
            (second && agent.salesTechniques.includes('alternative_close')
              ? `¿Cuál te gusta más, ${first.name} o ${second.name}? Te lo separo y te envío el link de pago.`
              : 'Si te gusta, dime “lo quiero” y te envío el link de pago.'));
      const greeting = params.firstTurn
        ? `¡Hola! Soy ${agent.name} de ${agent.companyName}. `
        : '';
      const intro =
        params.pending?.kind === 'product'
          ? 'Tengo estas opciones para ti:'
          : browse
            ? `Estas son algunas opciones${browse.category ? ` de ${browse.category}` : ''}:`
            : 'Encontré esto en el catálogo:';
      const moreHint = browse?.remaining
        ? `\nTengo ${browse.remaining} ${browse.remaining === 1 ? 'opción' : 'opciones'} más; escribe “ver más” para verlas.`
        : '';
      return {
        escalate: false,
        usedCatalog: true,
        pauseOnHandoff: agent.pauseOnHandoff,
        replyText: this.applyTone(
          agent,
          `${greeting}${intro}\n${lines.join('\n')}${faqNote}${moreHint}\n${closeHint}`,
        ),
      };
    }

    const text = normalizeText(params.inboundText);
    if (/hola|buenas|buen\s*dia|hey/.test(text)) {
      const discover = params.journeys.find(
        (item) => item.stage === 'DISCOVER',
      )?.scriptText;
      return {
        escalate: false,
        usedCatalog: false,
        pauseOnHandoff: agent.pauseOnHandoff,
        replyText: this.applyTone(
          agent,
          params.firstTurn
            ? (agent.initialMessage ??
                discover ??
                `¡Hola! Soy ${agent.name} de ${agent.companyName}. ¿Qué producto estás buscando hoy?`)
            : '¡Hola de nuevo! ¿En qué más te puedo ayudar?',
        ),
      };
    }

    return {
      escalate: false,
      usedCatalog: false,
      pauseOnHandoff: agent.pauseOnHandoff,
      replyText: this.applyTone(
        agent,
        params.firstTurn
          ? `Gracias por escribirnos. Puedo ayudarte a elegir un producto de ${agent.companyName}. Cuéntame qué buscas y te recomiendo opciones con precio y stock reales del catálogo.`
          : 'Cuéntame qué producto buscas y te paso precio y disponibilidad del catálogo.',
      ),
    };
  }

  /** `keepLines`: the text carries amounts or a link that must never be cut by the concise length. */
  private applyTone(
    agent: AgentPersonality,
    text: string,
    options: { keepLines?: boolean } = {},
  ): string {
    let result = text;
    if (!agent.useEmojis) {
      result = result
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
        .replace(options.keepLines ? /[^\S\n]{2,}/g : /\s{2,}/g, ' ')
        .trim();
    } else if (agent.emojiPalette && !/[\u{1F300}-\u{1FAFF}]/u.test(result)) {
      const emoji = agent.emojiPalette.trim().split(/\s+/)[0];
      if (emoji) {
        result = `${result} ${emoji}`;
      }
    }

    if (agent.responseLength === 'concise' && !options.keepLines) {
      result = result.split('\n').slice(0, 4).join('\n');
    }

    return result;
  }

  private async generateWithOpenAi(params: {
    apiKey: string;
    model: string;
    agent: AgentPersonality;
    inboundText: string;
    history: ConversationTurn[];
    firstTurn: boolean;
    catalogMatches: CatalogProductView[];
    faqMatches: FaqMatch[];
    journeys: JourneyView[];
    checkoutUrl?: string;
    deliveryText: DeliveryText;
    cartOrder: boolean;
    pending: PendingChoice;
    browse: BrowseView | null;
    sendsPhotos: boolean;
    mode: AgentRuntimeMode;
  }): Promise<Omit<
    AgentReplyResult,
    'pauseOnHandoff' | 'tools' | 'images' | 'orderId' | 'checkoutUrl'
  > | null> {
    const catalogJson = params.catalogMatches.map((product) => ({
      name: product.name,
      ...(product.isService ? { type: 'servicio' } : {}),
      description: product.descriptionShort,
      price: product.priceLabel,
      stock: product.stockLabel,
      lowStock:
        !product.isService &&
        !product.stockUnlimited &&
        product.stockQty !== null &&
        product.stockQty > 0 &&
        product.stockQty <= LOW_STOCK_UNITS,
      url: product.productUrl,
      variants: product.variants.map((variant) => ({
        label: variant.label,
        price: variant.priceLabel,
        stock: variant.stockLabel,
      })),
    }));

    const agent = params.agent;

    const system = [
      buildAgentPrompt(agent),
      '',
      'CONTEXTO DE ESTE TURNO:',
      params.firstTurn
        ? `Es el primer mensaje de esta conversación: saluda una sola vez y de forma breve${agent.initialMessage ? `, usando como base: "${agent.initialMessage}"` : ''}.`
        : 'La conversación ya está en curso (ver historial): NO vuelvas a saludar ni a presentarte. Responde directo a lo último que dijo el cliente, sin repetir lo que ya le dijiste.',
      'Usa el historial para entender referencias como "ese", "el segundo" o "lo quiero".',
      journeyGuide(params.journeys),
      params.checkoutUrl
        ? 'El link de pago ya está generado y se envía como botón "Pagar pedido" justo debajo de tu mensaje: NO escribas ninguna URL. Termina tu mensaje con una frase corta que presente el link (por ejemplo: "Aquí tienes el link de pago para completar tu compra:").'
        : '',
      params.checkoutUrl && params.deliveryText.summary
        ? `Incluye este detalle del pedido tal cual, línea por línea, con sus asteriscos y sin cambiar ningún monto:\n${params.deliveryText.summary}`
        : '',
      params.checkoutUrl && params.deliveryText.note
        ? `Agrega después del detalle: "${params.deliveryText.note}"`
        : '',
      params.pending?.kind === 'delivery'
        ? `El cliente quiere comprar, pero antes del link de pago necesitas saber dónde entregar. Pregúntale esto, con tus palabras pero sin cambiar los datos: "${params.pending.question}". No generes ni prometas link de pago todavía.`
        : '',
      SHIPPING_RULE,
      params.catalogMatches.some((product) => product.isService)
        ? SERVICE_RULE
        : '',
      params.cartOrder
        ? 'El cliente envió su carrito de la tienda web y ya quedó registrado como pedido. Agradécele, resume los productos y dile que un asesor confirmará stock, envío y forma de pago. No envíes link de pago.'
        : '',
      params.pending?.kind === 'product'
        ? 'El cliente quiere comprar pero no está claro qué producto: presenta brevemente las opciones del catálogo y pregúntale cuál prefiere. No generes ni prometas link de pago todavía.'
        : '',
      params.pending?.kind === 'variant'
        ? `El cliente quiere ${params.pending.product.name}: pregúntale qué opción prefiere (${params.pending.product.variants.map((variant) => variant.label).join(', ')}) antes de generar el link de pago.`
        : '',
      params.browse?.mode === 'overview'
        ? 'El cliente quiere ver el catálogo y es amplio: NO listes productos. Resume las categorías de catalogOverview con su cantidad de productos (ej.: "Tenemos 30 productos: Perfumes (20) y Cremas (10)"), comparte storeUrl si existe y pregúntale qué busca (tipo de producto, presupuesto u ocasión) para recomendarle.'
        : '',
      params.browse?.mode === 'page' && params.browse.products.length
        ? `Presenta solo estos ${params.browse.products.length} productos${params.browse.category ? ` de ${params.browse.category}` : ''}.${params.browse.remaining ? ` Hay ${params.browse.remaining} más: invítalo a escribir "ver más" o a contarte qué prefiere para afinar.` : ' No hay más opciones en esta búsqueda.'}`
        : '',
      params.browse?.mode === 'page' && !params.browse.products.length
        ? `Ya se mostraron todas las opciones${params.browse.category ? ` de ${params.browse.category}` : ''}: díselo, comparte storeUrl si existe y ofrece ayudarle a elegir entre lo que vio.`
        : '',
      params.sendsPhotos
        ? 'Las fotos de los productos recomendados se envían automáticamente justo después de tu mensaje: no digas que no puedes enviar fotos.'
        : '',
      'Si un producto del catálogo tiene url, puedes compartirla para que vea más detalles en la tienda.',
      params.mode === 'playground'
        ? 'Estás en playground de prueba: sé claro si algo es simulado.'
        : '',
      'Devuelve SOLO JSON válido: {"replyText":"...","escalate":false,"usedCatalog":true}',
    ]
      .filter(Boolean)
      .join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model,
        temperature: 0.4,
        max_tokens: MAX_OUTPUT_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          ...params.history.map((turn) => ({
            role: turn.role === 'buyer' ? 'user' : 'assistant',
            content: turn.text,
          })),
          {
            role: 'user',
            content: JSON.stringify({
              inboundText: params.inboundText,
              catalog: catalogJson,
              ...(params.browse
                ? {
                    catalogOverview: {
                      totalProducts: params.browse.overview.total,
                      categories: params.browse.overview.categories
                        .slice(0, 12)
                        .map((item) => ({
                          category: item.label,
                          products: item.count,
                        })),
                    },
                    storeUrl: params.browse.overview.storeUrl,
                  }
                : {}),
              faqs: params.faqMatches,
              journeyScripts: params.journeys,
              paymentLinkReady: Boolean(params.checkoutUrl),
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return null;
    }

    const parsed = JSON.parse(content) as {
      replyText?: string;
      escalate?: boolean;
      usedCatalog?: boolean;
    };

    if (!parsed.replyText) {
      return null;
    }

    return {
      replyText: parsed.replyText,
      escalate: Boolean(parsed.escalate),
      usedCatalog: Boolean(parsed.usedCatalog),
    };
  }
}
