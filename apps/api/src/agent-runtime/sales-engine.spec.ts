import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import {
  SalesAgentToolsService,
  CatalogProductView,
} from './sales-agent-tools.service';
import { SalesAgentRuntimeService } from './sales-agent-runtime.service';
import {
  initialSalesState,
  observeBuyer,
  resolveSalesReference,
  completeSalesTurn,
} from './sales-state';
import { validateSalesResponse } from './sales-response-validator';
import { contextMessages } from './sales-context';
import {
  aggregateSalesEvaluations,
  evaluateSalesTurn,
} from './sales-evaluation';

export const shoe = (
  id: string,
  name: string,
  cents = 15000,
): CatalogProductView => ({
  id,
  handle: id,
  name,
  basePriceCents: cents,
  currency: 'PEN',
  descriptionShort: 'Para uso diario',
  categories: ['Zapatillas'],
  isAvailable: true,
  stockUnlimited: false,
  stockQty: 2,
  stockLabel: '2 en stock',
  priceLabel: `S/ ${(cents / 100).toFixed(2)}`,
  isService: false,
  productUrl: null,
  imageUrl: null,
  variants: [
    {
      id: `${id}-v40`,
      label: 'Negro / 40',
      priceCents: cents,
      priceLabel: `S/ ${(cents / 100).toFixed(2)}`,
      stockLabel: '2 en stock',
      isAvailable: true,
    },
  ],
});

describe('AI Sales Engine regression/evaluation', () => {
  let runtime: SalesAgentRuntimeService;
  let tools: SalesAgentToolsService;
  const products = [
    shoe('one', 'Zapatilla negra Uno'),
    shoe('two', 'Zapatilla negra Dos', 16000),
  ];
  beforeEach(() => {
    tools = new SalesAgentToolsService(
      null as never,
      null as never,
      null as never,
    );
    jest.spyOn(tools, 'listAvailableProducts').mockResolvedValue(products);
    jest
      .spyOn(tools, 'catalogOverview')
      .mockResolvedValue({ total: 2, categories: [], storeUrl: null });
    jest.spyOn(tools, 'shippingRules').mockResolvedValue(null);
    jest
      .spyOn(tools, 'createOrderWithOptionalLink')
      .mockResolvedValue({
        traces: [{ name: 'create_order', status: 'ok', summary: 'fixture' }],
        orderId: 'order',
        checkoutUrl: 'https://example.test/pay',
        dryRun: true,
      });
    runtime = new SalesAgentRuntimeService(
      {
        salesAgent: { findFirst: jest.fn().mockResolvedValue(null) },
      } as unknown as PrismaService,
      { get: (_key: string, value: unknown) => value } as ConfigService,
      tools,
      {
        getRuntimeKnowledge: async () => ({ faqs: [], journeys: [] }),
      } as unknown as KnowledgeService,
    );
  });
  afterEach(() => jest.restoreAllMocks());

  it('A/F: retains size, color and budget without history and without asking them again', async () => {
    const state = observeBuyer(
      initialSalesState(),
      'Busco zapatillas negras talla 40 máximo 180',
      'old-message',
    );
    const result = await runtime.generateReply({
      tenantId: 'tenant-a',
      inboundText: '¿Qué tienes?',
      salesState: state,
      history: [],
    });
    expect(result.salesState?.requirements.size.value).toBe('40');
    expect(result.salesState?.requirements.budget.value).toBe('18000');
    expect(
      validateSalesResponse(
        result.replyText,
        products.map((p) => p.name),
        products,
        result.salesState,
      ),
    ).not.toContain('repeated_question');
    expect(tools.listAvailableProducts).toHaveBeenCalledWith(
      'tenant-a',
      [],
      [],
      'Busco zapatillas negras talla 40 máximo 180',
    );
    expect(result.salesState?.recommendedProductIds).toEqual(['one', 'two']);
    const evaluation = evaluateSalesTurn(result, products, {
      facts: { size: '40', budget: '18000', color: 'negra' },
      productIds: ['one', 'two'],
      stage: 'RECOMMENDATION',
      handoff: false,
      progressed: true,
      allowedTools: [
        'search_catalog',
        'get_product_availability',
        'lookup_faq',
      ],
    });
    expect(evaluation.context_retention).toBe(1);
    expect(evaluation.repeated_question_rate).toBe(0);
    expect(
      aggregateSalesEvaluations([evaluation]).reference_resolution_accuracy
        .value,
    ).toBeNull();
  });
  it('B: resolves the second previously shown product after recent history eviction', async () => {
    const state = initialSalesState();
    state.recommendedProductIds = ['one', 'two'];
    const result = await runtime.generateReply({
      tenantId: 'tenant-a',
      inboundText: 'Me gusta el segundo',
      salesState: state,
    });
    expect(result.salesState?.selectedProduct?.productId).toBe('two');
    expect(result.salesState?.stage).toBe('PRODUCT_SELECTED');
    expect(result.replyText).toContain(products[1].name);
  });
  it('J: an immediate purchase with size skips discovery and uses backend commerce', async () => {
    const result = await runtime.generateReply({
      tenantId: 'tenant-a',
      inboundText: 'Quiero comprar Zapatilla negra Uno talla 40',
      salesState: initialSalesState(),
      assertOwned: jest.fn(),
    });
    expect(tools.createOrderWithOptionalLink).toHaveBeenCalled();
    expect(result.salesState?.stage).toBe('PAYMENT_PENDING');
    expect(result.salesState?.selectedProduct?.variantId).toBe('one-v40');
  });
  it('H: never creates an order for an exhausted product', async () => {
    const exhausted = {
      ...products[0],
      isAvailable: false,
      stockQty: 0,
      stockLabel: 'Agotado',
      variants: [],
    };
    jest.spyOn(tools, 'listAvailableProducts').mockResolvedValue([exhausted]);
    const result = await runtime.generateReply({
      tenantId: 'tenant-a',
      inboundText: 'Quiero comprar Zapatilla negra Uno',
      salesState: initialSalesState(),
    });
    expect(result.replyText).toContain('Agotado');
    expect(tools.createOrderWithOptionalLink).not.toHaveBeenCalled();
  });
  it('does not require a budget and preserves explicit changes of variant', () => {
    let state = observeBuyer(
      initialSalesState(),
      'Busco un perfume talla M',
      'm1',
    );
    expect(state.requirements.budget).toBeUndefined();
    state = observeBuyer(state, 'Mejor talla L', 'm2');
    expect(state.requirements.size.value).toBe('l');
  });
  it('does not promote a negated or ambiguous size into a confirmed choice', () => {
    expect(
      observeBuyer(
        initialSalesState(),
        'No talla 40, talla 41; no negro, rojo',
        'm',
      ).requirements.size.value,
    ).toBe('41');
    expect(
      observeBuyer(
        initialSalesState(),
        'No talla 40, talla 41; no negro, rojo',
        'm',
      ).requirements.color.value,
    ).toBe('rojo');
    expect(
      observeBuyer(initialSalesState(), 'Talla 40 o 41', 'm').requirements.size,
    ).toBeUndefined();
  });
  it('never substitutes the only available size for the requested unavailable size', async () => {
    const result = await runtime.generateReply({
      tenantId: 'tenant-a',
      inboundText: 'Quiero comprar Zapatilla negra Uno talla 41',
      salesState: initialSalesState(),
    });
    expect(tools.createOrderWithOptionalLink).not.toHaveBeenCalled();
    expect(result.replyText).toContain('no está disponible');
  });
  it('handles price objections and rejects a changed selection', () => {
    const state = initialSalesState();
    state.selectedProduct = { productId: 'one' };
    const next = observeBuyer(state, 'Muy caro, cambio de opinión', 'm2');
    expect(next.stage).toBe('OBJECTION_HANDLING');
    expect(next.selectedProduct).toBeUndefined();
    expect(next.rejectedProducts[0].productId).toBe('one');
  });
  it('explicit human requests skip commerce and persist the reason', async () => {
    const result = await runtime.generateReply({
      tenantId: 'tenant-a',
      inboundText: 'Quiero hablar con un humano',
      salesState: initialSalesState(),
    });
    expect(result.escalate).toBe(true);
    expect(result.salesState?.stage).toBe('HUMAN_HANDOFF');
    expect(tools.createOrderWithOptionalLink).not.toHaveBeenCalled();
  });
  it('product removal cannot shift an ordinal onto another product', () => {
    const state = initialSalesState();
    state.recommendedProductIds = ['one', 'two'];
    expect(
      resolveSalesReference('el primero', state, [products[1]]),
    ).toBeNull();
    expect(resolveSalesReference('el segundo', state, [products[1]])?.id).toBe(
      'two',
    );
  });
  it('does not guess an ambiguous reference and resolves the cheapest from current prices', () => {
    const state = initialSalesState();
    state.recommendedProductIds = ['one', 'two'];
    expect(resolveSalesReference('ese', state, products)).toBeNull();
    expect(
      resolveSalesReference('el más barato', state, [
        products[0],
        { ...products[1], basePriceCents: 10000 },
      ])?.id,
    ).toBe('two');
  });
  it('incremental summaries keep decisions/facts without summarizing every turn', () => {
    const state = observeBuyer(initialSalesState(), 'Talla 40', 'm1');
    const result = { tools: [], escalate: false };
    const next = completeSalesTurn(state, result, 2);
    expect(next.summary.updatedAtTurn).toBe(0);
    const summarized = completeSalesTurn(next, result, 2);
    expect(summarized.summary.confirmedFacts.size).toBe('40');
    expect(summarized.summary.updatedAtTurn).toBe(2);
  });
  it.each([
    ['Tiene un precio de S/ 1.00', 'unsupported_price'],
    ['Está disponible en talla 41', 'unsupported_variant'],
    ['Tenemos 99 unidades en stock', 'unsupported_inventory_quantity'],
    ['El envío es gratis y llega en 2 días', 'unsupported_shipping'],
    ['Tienes garantía de por vida', 'unsupported_policy'],
    ['¿Qué talla buscas?', 'repeated_question'],
    ['Ya reservé tu pedido', 'unsupported_action'],
  ])('rejects an ungrounded answer: %s', (text, failure) => {
    const state = observeBuyer(initialSalesState(), 'Talla 40', 'm1');
    expect(
      validateSalesResponse(text, [products[0].name], products, state),
    ).toContain(failure);
  });
  it('retains critical state/current message and drops whole history turns to meet the budget', () => {
    const state = observeBuyer(initialSalesState(), 'Talla 40', 'm1');
    const messages = contextMessages(
      'rules',
      { inboundText: '¿Qué tienes?' },
      state,
      Array.from({ length: 40 }, () => ({
        role: 'buyer' as const,
        text: 'long '.repeat(200),
      })),
      1500,
      20,
    );
    expect(messages.at(-1)?.content).toContain('40');
    expect(messages.length).toBeLessThan(20);
    expect(() =>
      contextMessages('critical'.repeat(1000), {}, state, [], 100, 20),
    ).toThrow('SALES_CONTEXT_BUDGET_EXCEEDED');
  });
});
