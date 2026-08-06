import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export type AgentReplyResult = {
  replyText: string;
  escalate: boolean;
  usedCatalog: boolean;
  pauseOnHandoff: boolean;
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
  handoffMessage?: string | null;
  pauseOnHandoff: boolean;
};

@Injectable()
export class SalesAgentRuntimeService {
  private readonly logger = new Logger(SalesAgentRuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async generateReply(params: {
    tenantId: string;
    conversationId: string;
    inboundText: string;
  }): Promise<AgentReplyResult> {
    const [agentRow, products] = await Promise.all([
      this.prisma.salesAgent.findFirst({
        where: { tenantId: params.tenantId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.product.findMany({
        where: { tenantId: params.tenantId, isAvailable: true },
        take: 20,
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const agent: AgentPersonality = {
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
      handoffMessage: agentRow?.handoffMessage,
      pauseOnHandoff: agentRow?.pauseOnHandoff ?? true,
    };

    const catalogMatches = this.searchCatalog(params.inboundText, products);
    const openAiKey = this.config.get<string>('OPENAI_API_KEY');

    if (openAiKey) {
      try {
        const ai = await this.generateWithOpenAi({
          apiKey: openAiKey,
          model: this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini'),
          agent,
          inboundText: params.inboundText,
          catalogMatches,
        });
        if (ai) {
          return { ...ai, pauseOnHandoff: agent.pauseOnHandoff };
        }
      } catch (error) {
        this.logger.warn(
          `OpenAI failed, using deterministic fallback: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }
    }

    return this.deterministicReply({
      agent,
      inboundText: params.inboundText,
      catalogMatches,
    });
  }

  private searchCatalog(
    inboundText: string,
    products: Array<{
      id: string;
      name: string;
      descriptionShort: string | null;
      basePriceCents: number;
      currency: string;
      categories: string[];
    }>,
  ) {
    const query = inboundText.toLowerCase();
    const tokens = query.split(/\s+/).filter((token) => token.length > 2);

    return products
      .map((product) => {
        const haystack = [
          product.name,
          product.descriptionShort ?? '',
          product.categories.join(' '),
        ]
          .join(' ')
          .toLowerCase();
        const score = tokens.reduce(
          (acc, token) => (haystack.includes(token) ? acc + 1 : acc),
          0,
        );
        return { product, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => item.product);
  }

  private deterministicReply(params: {
    agent: AgentPersonality;
    inboundText: string;
    catalogMatches: Array<{
      name: string;
      descriptionShort: string | null;
      basePriceCents: number;
      currency: string;
    }>;
  }): AgentReplyResult {
    const { agent } = params;
    const text = params.inboundText.toLowerCase();
    const wantsHuman =
      /humano|asesor|persona|agent(e|a)?\s+humano|hablar con alguien/.test(
        text,
      );

    if (wantsHuman) {
      return {
        escalate: true,
        usedCatalog: false,
        pauseOnHandoff: agent.pauseOnHandoff,
        replyText:
          agent.handoffMessage ??
          'Te conectaré con un agente humano para brindarte más ayuda.',
      };
    }

    if (params.catalogMatches.length > 0) {
      const lines = params.catalogMatches.map((product) => {
        const price = (product.basePriceCents / 100).toFixed(2);
        const blurb = product.descriptionShort
          ? ` — ${product.descriptionShort}`
          : '';
        return `• ${product.name} (${product.currency} ${price})${blurb}`;
      });
      return {
        escalate: false,
        usedCatalog: true,
        pauseOnHandoff: agent.pauseOnHandoff,
        replyText: this.applyTone(
          agent,
          `¡Hola! Soy ${agent.name} de ${agent.companyName}. Encontré esto en el catálogo:\n${lines.join('\n')}\n¿Cuál te interesa?`,
        ),
      };
    }

    if (/hola|buenas|buen\s*d[ií]a|hey/.test(text)) {
      return {
        escalate: false,
        usedCatalog: false,
        pauseOnHandoff: agent.pauseOnHandoff,
        replyText: this.applyTone(
          agent,
          agent.initialMessage ??
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
        `Gracias por escribirnos. Puedo ayudarte a elegir un producto de ${agent.companyName}. Cuéntame qué buscas (categoría, talla, presupuesto) y te recomiendo opciones con precio real del catálogo.`,
      ),
    };
  }

  private applyTone(agent: AgentPersonality, text: string): string {
    let result = text;
    if (!agent.useEmojis) {
      result = result.replace(
        /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,
        '',
      ).replace(/\s{2,}/g, ' ').trim();
    } else if (agent.emojiPalette && !/[\u{1F300}-\u{1FAFF}]/u.test(result)) {
      const emoji = agent.emojiPalette.trim().split(/\s+/)[0];
      if (emoji) {
        result = `${result} ${emoji}`;
      }
    }

    if (agent.responseLength === 'concise') {
      result = result.split('\n').slice(0, 3).join('\n');
    }

    return result;
  }

  private async generateWithOpenAi(params: {
    apiKey: string;
    model: string;
    agent: AgentPersonality;
    inboundText: string;
    catalogMatches: Array<{
      name: string;
      descriptionShort: string | null;
      basePriceCents: number;
      currency: string;
    }>;
  }): Promise<Omit<AgentReplyResult, 'pauseOnHandoff'> | null> {
    const catalogJson = params.catalogMatches.map((product) => ({
      name: product.name,
      description: product.descriptionShort,
      price: `${product.currency} ${(product.basePriceCents / 100).toFixed(2)}`,
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
      'Nunca inventes precios ni stock. Solo usa el catálogo provisto.',
      'Si el cliente pide humano, responde con escalate=true.',
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
      agent.wordsToAvoid
        ? `Palabras a evitar: ${agent.wordsToAvoid}`
        : '',
      agent.handoffMessage
        ? `Si escalas a humano, usa este mensaje base: ${agent.handoffMessage}`
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
