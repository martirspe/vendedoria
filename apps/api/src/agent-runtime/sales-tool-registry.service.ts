import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  validateSync,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { planDelivery } from './delivery-plan';
import {
  SalesAgentToolsService,
  AgentToolTrace,
  CatalogProductView,
} from './sales-agent-tools.service';
import { catalogContext } from './catalog-context';

class ReadToolArguments {
  @IsOptional() @IsString() @MaxLength(600) query?: string;
  @IsOptional() @IsString() @MaxLength(100) productId?: string;
  @IsOptional() @IsString() @MaxLength(100) orderId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100000000) subtotalCents?: number;
}
const DEFINITIONS = {
  search_products: {
    description:
      'Busca candidatos del catálogo actual por necesidad, categoría, presupuesto y atributos. Devuelve productos hidratados de este negocio.',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
  get_product: {
    description: 'Consulta hechos actuales de un producto conocido.',
    properties: { productId: { type: 'string' } },
    required: ['productId'],
  },
  get_product_variants: {
    description: 'Consulta las variantes publicadas y su disponibilidad real.',
    properties: { productId: { type: 'string' } },
    required: ['productId'],
  },
  check_inventory: {
    description: 'Consulta stock real; nunca confirma una variante agotada.',
    properties: { productId: { type: 'string' } },
    required: ['productId'],
  },
  get_price: {
    description: 'Consulta precio actual y moneda de producto/variantes.',
    properties: { productId: { type: 'string' } },
    required: ['productId'],
  },
  calculate_shipping: {
    description:
      'Consulta las reglas reales de entrega para el destino del cliente. El subtotal debe proceder del catálogo.',
    properties: {
      query: { type: 'string' },
      subtotalCents: { type: 'integer' },
    },
    required: ['query', 'subtotalCents'],
  },
  get_commercial_policy: {
    description:
      'Consulta FAQ aprobada del negocio sobre políticas y condiciones.',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
  get_order_status: {
    description:
      'Consulta estado del pedido vinculado a esta conversación; no permite consultar pedidos de otros clientes.',
    properties: { orderId: { type: 'string' } },
    required: ['orderId'],
  },
} as const;
export type SalesReadTool = keyof typeof DEFINITIONS;

@Injectable()
export class SalesToolRegistry {
  constructor(
    private readonly tools: SalesAgentToolsService,
    private readonly knowledge: KnowledgeService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}
  definitions() {
    return Object.entries(DEFINITIONS).map(([name, spec]) => ({
      type: 'function',
      function: {
        name,
        description: spec.description,
        parameters: {
          type: 'object',
          properties: spec.properties,
          required: [...spec.required],
          additionalProperties: false,
        },
      },
    }));
  }

  async execute(
    context: {
      tenantId: string;
      conversationId?: string | null;
      authoritativeSubtotal?: number;
    },
    name: string,
    raw: unknown,
  ): Promise<{
    value: unknown;
    trace: AgentToolTrace;
    products?: CatalogProductView[];
    policyAnswers?: string[];
  }> {
    const started = Date.now();
    const tool = DEFINITIONS[name as SalesReadTool];
    const failure = (code: string) => ({
      value: { error: code },
      trace: {
        name: name as SalesReadTool,
        status: 'error' as const,
        summary: code,
        data: { latencyMs: Date.now() - started },
      },
    });
    if (!tool || !raw || typeof raw !== 'object' || Array.isArray(raw))
      return failure('INVALID_TOOL');
    const input = raw as Record<string, unknown>;
    if (
      Object.keys(input).some((key) => !(key in tool.properties)) ||
      tool.required.some((key) => !(key in input))
    )
      return failure('INVALID_ARGUMENTS');
    const dto = plainToInstance(ReadToolArguments, input);
    if (
      validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length
    )
      return failure('INVALID_ARGUMENTS');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        this.read(context, name as SalesReadTool, dto),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('TOOL_TIMEOUT')),
            Number(this.config.get('SALES_TOOL_TIMEOUT_MS', 10000)),
          );
        }),
      ]);
      const errorCode =
        result.value &&
        typeof result.value === 'object' &&
        'error' in result.value
          ? String(result.value.error)
          : undefined;
      return {
        ...result,
        trace: {
          name: name as SalesReadTool,
          status: errorCode ? 'error' : 'ok',
          summary: errorCode ?? 'Consulta verificada',
          data: {
            latencyMs: Date.now() - started,
            ...(dto.productId ? { productId: dto.productId } : {}),
          },
        },
      };
    } catch {
      return failure('TOOL_UNAVAILABLE');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  private async read(
    context: {
      tenantId: string;
      conversationId?: string | null;
      authoritativeSubtotal?: number;
    },
    name: SalesReadTool,
    dto: ReadToolArguments,
  ): Promise<{
    value: unknown;
    products?: CatalogProductView[];
    policyAnswers?: string[];
  }> {
    const { tenantId } = context;
    if (name === 'search_products') {
      const products = await this.tools.listAvailableProducts(
        tenantId,
        [],
        [],
        dto.query,
      );
      const matches = this.tools.searchCatalog(dto.query!, products).matches;
      return {
        value: {
          products: matches.map((p) => ({
            id: p.id,
            ...catalogContext([p], dto.query ?? '')[0],
          })),
        },
        products: matches,
      };
    }
    if (name === 'get_commercial_policy') {
      const knowledge = await this.knowledge.getRuntimeKnowledge(
        tenantId,
        dto.query,
      );
      const faqs = this.tools.lookupFaqs(
        dto.query!,
        knowledge.faqs,
        knowledge.retrievedFaqIds,
      ).matches;
      return { value: faqs, policyAnswers: faqs.map((faq) => faq.answer) };
    }
    if (name === 'calculate_shipping') {
      if (
        context.authoritativeSubtotal === undefined ||
        dto.subtotalCents !== context.authoritativeSubtotal
      )
        return { value: { error: 'SUBTOTAL_NOT_GROUNDED' } };
      return {
        value: planDelivery({
          rules: await this.tools.shippingRules(tenantId),
          text: dto.query!,
          subtotalCents: context.authoritativeSubtotal,
        }),
      };
    }
    if (name === 'get_order_status') {
      if (!context.conversationId)
        return { value: { error: 'NO_PRODUCTION_CONVERSATION' } };
      const order = await this.prisma.order.findFirst({
        where: {
          tenantId,
          id: dto.orderId,
          conversationId: context.conversationId,
        },
        select: {
          id: true,
          status: true,
          totalCents: true,
          currency: true,
          payments: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { status: true },
          },
        },
      });
      return { value: order ?? { error: 'ORDER_NOT_FOUND' } };
    }
    const product = (
      await this.tools.getProducts(tenantId, [dto.productId!])
    )[0];
    if (!product) return { value: { error: 'PRODUCT_NOT_FOUND' } };
    if (name === 'get_product')
      return {
        value: { id: product.id, ...catalogContext([product], '')[0] },
        products: [product],
      };
    if (name === 'get_product_variants')
      return {
        value: { productId: product.id, variants: product.variants },
        products: [product],
      };
    if (name === 'get_price')
      return {
        value: {
          productId: product.id,
          priceCents: product.basePriceCents,
          currency: product.currency,
          variants: product.variants.map((v) => ({
            id: v.id,
            priceCents: v.priceCents,
          })),
        },
        products: [product],
      };
    return {
      value: this.tools.getAvailability(product).data,
      products: [product],
    };
  }
}
