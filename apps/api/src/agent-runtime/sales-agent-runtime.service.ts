import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AgentRuntimeMode,
  AgentToolTrace,
  CatalogProductView,
  SalesAgentToolsService,
} from './sales-agent-tools.service';

export type AgentReplyResult = {
  replyText: string;
  escalate: boolean;
  usedCatalog: boolean;
  pauseOnHandoff: boolean;
  tools: AgentToolTrace[];
  orderId?: string;
  checkoutUrl?: string;
};

type AgentPersonality = {
  name: string;
  companyName: string;
  companyDescription?: string | null;
  audienceDescription?: string | null;
  rulesText?: string | null;
  communicationStyle?: string | null;
  salesStyle?: string | null;
  responseLength: string;
  useEmojis: boolean;
  emojiPalette?: string | null;
  wordsToAvoid?: string | null;
  initialMessage?: string | null;
  purchaseConfirmMessage?: string | null;
  handoffMessage?: string | null;
  pauseOnHandoff: boolean;
  neverOfferDiscount: boolean;
  neverInventShipping: boolean;
  catalogOnlyFacts: boolean;
  isActive: boolean;
};

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

  async generateReply(params: {
    tenantId: string;
    conversationId?: string | null;
    inboundText: string;
    mode?: AgentRuntimeMode;
    customerName?: string | null;
    customerPhone?: string | null;
  }): Promise<AgentReplyResult> {
    const mode = params.mode ?? 'production';
    const [agentRow, products, runtimeKnowledge] = await Promise.all([
      this.prisma.salesAgent.findFirst({
        where: { tenantId: params.tenantId },
        orderBy: { createdAt: 'asc' },
      }),
      this.tools.listAvailableProducts(params.tenantId),
      this.knowledge.getRuntimeKnowledge(params.tenantId),
    ]);

    const agent = this.toPersonality(agentRow);

    if (!agent.isActive && mode === 'production') {
      return {
        replyText:
          'El vendedor IA está pausado. Un humano te atenderá en breve.',
        escalate: true,
        usedCatalog: false,
        pauseOnHandoff: true,
        tools: [this.tools.escalateTrace('vendedor inactivo')],
      };
    }

    const traces: AgentToolTrace[] = [];
    const { matches, trace: searchTrace } = this.tools.searchCatalog(
      params.inboundText,
      products,
    );
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
        replyText:
          agent.handoffMessage ??
          'Te conectaré con un agente humano para brindarte más ayuda.',
      };
    }

    let orderId: string | undefined;
    let checkoutUrl: string | undefined;

    if (this.tools.wantsPurchase(params.inboundText) && matches[0]) {
      const commerce = await this.tools.createOrderWithOptionalLink({
        tenantId: params.tenantId,
        mode,
        product: matches[0],
        conversationId: params.conversationId,
        customerName: params.customerName,
        customerPhone: params.customerPhone,
        createPaymentLink: true,
      });
      traces.push(...commerce.traces);
      orderId = commerce.orderId;
      checkoutUrl = commerce.checkoutUrl;
    }

    const openAiKey = this.config.get<string>('OPENAI_API_KEY');
    if (openAiKey) {
      try {
        const ai = await this.generateWithOpenAi({
          apiKey: openAiKey,
          model: this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini'),
          agent,
          inboundText: params.inboundText,
          catalogMatches: matches,
          faqMatches,
          journeys,
          checkoutUrl,
          mode,
        });
        if (ai) {
          return {
            ...ai,
            pauseOnHandoff: agent.pauseOnHandoff,
            tools: traces,
            orderId,
            checkoutUrl,
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
        catalogMatches: matches,
        faqMatches,
        journeys,
        checkoutUrl,
        mode,
      }),
      tools: traces,
      orderId,
      checkoutUrl,
    };
  }

  private toPersonality(
    agentRow: {
      name: string;
      companyName: string | null;
      companyDescription: string | null;
      audienceDescription: string | null;
      rulesText: string | null;
      communicationStyle: string | null;
      salesStyle: string | null;
      responseLength: string;
      useEmojis: boolean;
      emojiPalette: string | null;
      wordsToAvoid: string | null;
      initialMessage: string | null;
      purchaseConfirmMessage: string | null;
      handoffMessage: string | null;
      pauseOnHandoff: boolean;
      neverOfferDiscount: boolean;
      neverInventShipping: boolean;
      catalogOnlyFacts: boolean;
      isActive: boolean;
    } | null,
  ): AgentPersonality {
    return {
      name: agentRow?.name ?? 'Vendedor',
      companyName: agentRow?.companyName ?? 'nuestra tienda',
      companyDescription: agentRow?.companyDescription,
      audienceDescription: agentRow?.audienceDescription,
      rulesText: agentRow?.rulesText,
      communicationStyle: agentRow?.communicationStyle,
      salesStyle: agentRow?.salesStyle,
      responseLength: agentRow?.responseLength ?? 'balanced',
      useEmojis: agentRow?.useEmojis ?? true,
      emojiPalette: agentRow?.emojiPalette,
      wordsToAvoid: agentRow?.wordsToAvoid,
      initialMessage: agentRow?.initialMessage,
      purchaseConfirmMessage: agentRow?.purchaseConfirmMessage,
      handoffMessage: agentRow?.handoffMessage,
      pauseOnHandoff: agentRow?.pauseOnHandoff ?? true,
      neverOfferDiscount: agentRow?.neverOfferDiscount ?? true,
      neverInventShipping: agentRow?.neverInventShipping ?? true,
      catalogOnlyFacts: agentRow?.catalogOnlyFacts ?? true,
      isActive: agentRow?.isActive ?? true,
    };
  }

  private deterministicReply(params: {
    agent: AgentPersonality;
    inboundText: string;
    catalogMatches: CatalogProductView[];
    faqMatches: FaqMatch[];
    journeys: JourneyView[];
    checkoutUrl?: string;
    mode: AgentRuntimeMode;
  }): Omit<AgentReplyResult, 'tools' | 'orderId' | 'checkoutUrl'> {
    const { agent } = params;

    if (params.checkoutUrl) {
      const confirm =
        agent.purchaseConfirmMessage ??
        'Perfecto. Aquí tienes el link de pago para completar tu compra:';
      const dryNote =
        params.mode === 'playground'
          ? '\n\n(Prueba: este link es simulado y no aparece en Pedidos.)'
          : '';
      return {
        escalate: false,
        usedCatalog: true,
        pauseOnHandoff: agent.pauseOnHandoff,
        replyText: this.applyTone(
          agent,
          `${confirm}\n${params.checkoutUrl}${dryNote}`,
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
        return `• ${product.name} (${product.priceLabel}, ${product.stockLabel})${blurb}${variants}`;
      });
      const faqNote = params.faqMatches[0]
        ? `\n\nTambién: ${params.faqMatches[0].answer}`
        : '';
      const closeHint =
        params.journeys.find((item) => item.stage === 'CLOSE')?.scriptText ??
        'Si quieres comprar, dime “quiero comprar” y te armo el pedido con link de pago.';
      return {
        escalate: false,
        usedCatalog: true,
        pauseOnHandoff: agent.pauseOnHandoff,
        replyText: this.applyTone(
          agent,
          `¡Hola! Soy ${agent.name} de ${agent.companyName}. Encontré esto en el catálogo:\n${lines.join('\n')}${faqNote}\n${closeHint}`,
        ),
      };
    }

    const text = params.inboundText.toLowerCase();
    if (/hola|buenas|buen\s*d[ií]a|hey/.test(text)) {
      const discover =
        params.journeys.find((item) => item.stage === 'DISCOVER')?.scriptText;
      return {
        escalate: false,
        usedCatalog: false,
        pauseOnHandoff: agent.pauseOnHandoff,
        replyText: this.applyTone(
          agent,
          agent.initialMessage ??
            discover ??
            `¡Hola! Soy ${agent.name} de ${agent.companyName}. ¿Qué producto estás buscando hoy?`,
        ),
      };
    }

    return {
      escalate: false,
      usedCatalog: false,
      pauseOnHandoff: agent.pauseOnHandoff,
      replyText: this.applyTone(
        agent,
        `Gracias por escribirnos. Puedo ayudarte a elegir un producto de ${agent.companyName}. Cuéntame qué buscas y te recomiendo opciones con precio y stock reales del catálogo.`,
      ),
    };
  }

  private applyTone(agent: AgentPersonality, text: string): string {
    let result = text;
    if (!agent.useEmojis) {
      result = result
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    } else if (agent.emojiPalette && !/[\u{1F300}-\u{1FAFF}]/u.test(result)) {
      const emoji = agent.emojiPalette.trim().split(/\s+/)[0];
      if (emoji) {
        result = `${result} ${emoji}`;
      }
    }

    if (agent.responseLength === 'concise') {
      result = result.split('\n').slice(0, 4).join('\n');
    }

    return result;
  }

  private async generateWithOpenAi(params: {
    apiKey: string;
    model: string;
    agent: AgentPersonality;
    inboundText: string;
    catalogMatches: CatalogProductView[];
    faqMatches: FaqMatch[];
    journeys: JourneyView[];
    checkoutUrl?: string;
    mode: AgentRuntimeMode;
  }): Promise<Omit<
    AgentReplyResult,
    'pauseOnHandoff' | 'tools' | 'orderId' | 'checkoutUrl'
  > | null> {
    const catalogJson = params.catalogMatches.map((product) => ({
      name: product.name,
      description: product.descriptionShort,
      price: product.priceLabel,
      stock: product.stockLabel,
      variants: product.variants.map((variant) => ({
        label: variant.label,
        price: variant.priceLabel,
        stock: variant.stockLabel,
      })),
    }));

    const agent = params.agent;
    const lengthGuide =
      agent.responseLength === 'concise'
        ? 'Respuestas muy breves (1-3 oraciones).'
        : agent.responseLength === 'detailed'
          ? 'Puedes explicar con más detalle cuando ayude a vender.'
          : 'Respuestas equilibradas, claras y comerciales.';

    const system = [
      `Eres ${agent.name}, vendedor IA de ${agent.companyName}.`,
      'Responde en español.',
      lengthGuide,
      agent.catalogOnlyFacts
        ? 'Nunca inventes precios, stock ni productos. Solo usa catálogo/tools.'
        : 'Prioriza el catálogo/tools para hechos de producto.',
      agent.neverOfferDiscount
        ? 'Nunca ofrezcas descuentos ni inventes promociones.'
        : '',
      agent.neverInventShipping
        ? 'Nunca inventes plazos ni costos de envío. Solo usa FAQs o di que lo confirma un humano.'
        : '',
      'Para políticas (envío, cambios, horarios) usa SOLO las FAQs provistas. Si no hay FAQ, dilo y ofrece handoff.',
      'Si el cliente pide humano, responde con escalate=true.',
      params.checkoutUrl
        ? `Ya existe un link de pago generado: ${params.checkoutUrl}. Inclúyelo en la respuesta.`
        : '',
      params.mode === 'playground'
        ? 'Estás en playground de prueba: sé claro si algo es simulado.'
        : '',
      agent.useEmojis
        ? `Puedes usar emojis${agent.emojiPalette ? ` de esta paleta: ${agent.emojiPalette}` : ''}.`
        : 'No uses emojis.',
      agent.companyDescription
        ? `Descripción del negocio: ${agent.companyDescription}`
        : '',
      agent.audienceDescription
        ? `Audiencia: ${agent.audienceDescription}`
        : '',
      agent.communicationStyle
        ? `Estilo de comunicación: ${agent.communicationStyle}`
        : '',
      agent.salesStyle ? `Estilo de ventas: ${agent.salesStyle}` : '',
      agent.rulesText ? `Reglas: ${agent.rulesText}` : '',
      agent.wordsToAvoid ? `Palabras a evitar: ${agent.wordsToAvoid}` : '',
      agent.handoffMessage
        ? `Si escalas a humano, usa este mensaje base: ${agent.handoffMessage}`
        : '',
      agent.purchaseConfirmMessage
        ? `Si hay link de pago, usa como base: ${agent.purchaseConfirmMessage}`
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
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: JSON.stringify({
              inboundText: params.inboundText,
              catalog: catalogJson,
              faqs: params.faqMatches,
              journeyScripts: params.journeys,
              checkoutUrl: params.checkoutUrl ?? null,
              suggestedGreeting: agent.initialMessage,
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
