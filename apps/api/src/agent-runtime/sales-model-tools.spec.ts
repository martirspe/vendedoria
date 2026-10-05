import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { SalesAgentRuntimeService } from './sales-agent-runtime.service';
import {
  SalesAgentToolsService,
  CatalogProductView,
} from './sales-agent-tools.service';
import { SalesToolRegistry } from './sales-tool-registry.service';
import { initialSalesState, observeBuyer } from './sales-state';

describe('bounded model tool calling and grounding', () => {
  const product: CatalogProductView = {
    id: 'p',
    handle: 'perfume',
    name: 'Perfume Verde',
    descriptionShort: null,
    basePriceCents: 10000,
    priceLabel: 'S/ 100.00',
    stockLabel: '2 en stock',
    stockUnlimited: false,
    stockQty: 2,
    currency: 'PEN',
    isAvailable: true,
    categories: ['Perfumes'],
    isService: false,
    productUrl: null,
    imageUrl: null,
    variants: [],
  };
  let runtime: SalesAgentRuntimeService;
  let tools: SalesAgentToolsService;
  let fetchSpy: jest.SpyInstance;
  let execute: jest.Mock;
  const response = (message: unknown) =>
    ({
      ok: true,
      json: async () => ({
        choices: [{ message }],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      }),
    }) as Response;
  const answer = (replyText: string) => ({
    content: JSON.stringify({
      replyText,
      productNames: [product.name],
      usedCatalog: true,
      escalate: false,
    }),
  });
  beforeEach(() => {
    tools = new SalesAgentToolsService(
      null as never,
      null as never,
      null as never,
    );
    jest
      .spyOn(tools, 'listAvailableProducts')
      .mockResolvedValue([structuredClone(product)]);
    jest
      .spyOn(tools, 'getProducts')
      .mockResolvedValue([structuredClone(product)]);
    jest
      .spyOn(tools, 'catalogOverview')
      .mockResolvedValue({ total: 1, categories: [], storeUrl: null });
    execute = jest
      .fn()
      .mockResolvedValue({
        value: { priceCents: 10000, currency: 'PEN' },
        trace: { name: 'get_price', status: 'ok', summary: 'fixture' },
        products: [structuredClone(product)],
      });
    runtime = new SalesAgentRuntimeService(
      {
        salesAgent: { findFirst: jest.fn().mockResolvedValue(null) },
      } as unknown as PrismaService,
      {
        get: (key: string, fallback: unknown) =>
          key === 'OPENAI_API_KEY' ? 'fixture' : fallback,
      } as ConfigService,
      tools,
      {
        getRuntimeKnowledge: async () => ({ faqs: [], journeys: [] }),
      } as unknown as KnowledgeService,
      { definitions: () => [], execute } as unknown as SalesToolRegistry,
    );
    fetchSpy = jest.spyOn(global, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());
  it('executes read tools under backend tenant context and includes their results in the next call', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        response({
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: {
                name: 'get_price',
                arguments: JSON.stringify({ productId: 'p' }),
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response(answer('Perfume Verde cuesta S/ 100.00.')),
      );
    const result = await runtime.generateReply({
      tenantId: 'tenant',
      inboundText: 'Precio de Perfume Verde',
      salesState: initialSalesState(),
    });
    expect(execute.mock.calls[0][0].tenantId).toBe('tenant');
    const request = JSON.parse(fetchSpy.mock.calls[1][1].body);
    expect(
      request.messages.find((m: { role: string }) => m.role === 'tool')
        .tool_call_id,
    ).toBe('call-1');
    expect(result.usedAi).toBe(true);
    expect(result.trace?.inputTokens).toBe(200);
  });
  it('rejects fabricated prices and uses a grounded fallback', async () => {
    fetchSpy.mockResolvedValue(
      response(answer('Perfume Verde cuesta S/ 1.00.')),
    );
    const result = await runtime.generateReply({
      tenantId: 'tenant',
      inboundText: 'Precio de Perfume Verde',
      salesState: initialSalesState(),
    });
    expect(result.replyText).not.toContain('S/ 1.00');
    expect(result.replyText).toContain('S/ 100.00');
    expect(result.usedAi).not.toBe(true);
  });
  it('rejects a repeated question after the original message left the recent window', async () => {
    fetchSpy.mockResolvedValue(
      response(answer('Perfume Verde es una opción. ¿Qué presupuesto tienes?')),
    );
    const state = observeBuyer(
      initialSalesState(),
      'Busco perfume máximo 150',
      'm-old',
    );
    const result = await runtime.generateReply({
      tenantId: 'tenant',
      inboundText: 'Perfume Verde',
      salesState: state,
      history: [],
    });
    expect(result.replyText).not.toContain('¿Qué presupuesto tienes?');
    expect(result.usedAi).not.toBe(true);
  });
  it('rehydrates prices after model generation so a mid-turn price change fails validation', async () => {
    fetchSpy.mockResolvedValue(
      response(answer('Perfume Verde cuesta S/ 100.00.')),
    );
    jest
      .spyOn(tools, 'getProducts')
      .mockResolvedValue([
        { ...product, priceLabel: 'S/ 110.00', basePriceCents: 11000 },
      ]);
    const result = await runtime.generateReply({
      tenantId: 'tenant',
      inboundText: 'Precio de Perfume Verde',
      salesState: initialSalesState(),
    });
    expect(result.replyText).toContain('S/ 110.00');
    expect(result.replyText).not.toContain('S/ 100.00');
  });
  it('caps tool rounds even when the model keeps requesting calls', async () => {
    fetchSpy.mockResolvedValue(
      response({
        role: 'assistant',
        tool_calls: [
          {
            id: 'call',
            type: 'function',
            function: { name: 'get_price', arguments: '{"productId":"p"}' },
          },
        ],
      }),
    );
    const result = await runtime.generateReply({
      tenantId: 'tenant',
      inboundText: 'Perfume Verde',
      salesState: initialSalesState(),
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.usedAi).not.toBe(true);
  });
  it('hands off after repeated generation/validation failures and pauses automation', async () => {
    fetchSpy.mockResolvedValue(
      response(answer('Perfume Verde cuesta S/ 1.00.')),
    );
    const state = initialSalesState();
    state.consecutiveFallbacks = 2;
    const result = await runtime.generateReply({
      tenantId: 'tenant',
      inboundText: 'Perfume Verde',
      salesState: state,
    });
    expect(result.escalate).toBe(true);
    expect(result.pauseOnHandoff).toBe(true);
    expect(result.salesState?.handoffReason).toBe(
      'repeated_generation_failure',
    );
  });
});
