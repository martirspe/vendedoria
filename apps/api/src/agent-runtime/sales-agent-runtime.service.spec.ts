import { ConfigService } from '@nestjs/config';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildAgentContext, ConversationTurn } from './conversation-context';
import { SalesAgentRuntimeService } from './sales-agent-runtime.service';
import { CatalogProductView, SalesAgentToolsService } from './sales-agent-tools.service';

const product: CatalogProductView = {
  id: 'product-1', handle: 'perfume-prueba', name: 'Perfume de prueba',
  descriptionShort: 'Té verde · 200 ml', basePriceCents: 8400, currency: 'PEN',
  categories: [], isAvailable: true, stockUnlimited: false, stockQty: 4,
  stockLabel: '4 en stock', priceLabel: 'S/ 84.00', isService: false,
  productUrl: null, imageUrl: 'https://example.com/product.jpg', variants: [],
};
const closeScript = 'Ante señales de compra, deja de mostrar opciones: confirma cuál se lleva y pide el distrito para calcular el envío. Si duda entre dos, pregunta cuál le gustó más.';
const discoverScript = 'Antes de recomendar, descubre la necesidad del cliente y pregunta qué producto busca.';
const history: ConversationTurn[] = [
  { role: 'buyer', text: 'Busco un perfume' },
  { role: 'agent', text: 'Te recomiendo Perfume de prueba.', productIds: [product.id] },
];

describe('sales agent buyer replies', () => {
  let runtime: SalesAgentRuntimeService;
  let tools: SalesAgentToolsService;
  let fetchMock: jest.SpyInstance;
  let findAgent: jest.Mock;
  let aiEnabled: boolean;

  beforeEach(() => {
    aiEnabled = false;
    findAgent = jest.fn().mockResolvedValue(null);
    tools = new SalesAgentToolsService(null as never, null as never, null as never);
    jest.spyOn(tools, 'listAvailableProducts').mockResolvedValue([product]);
    jest.spyOn(tools, 'catalogOverview').mockResolvedValue({ total: 1, categories: [], storeUrl: null });
    jest.spyOn(tools, 'shippingRules').mockResolvedValue({
      deliveryEnabled: true, freeShippingFromCents: null, pickupEnabled: false,
      pickupAddress: null, shippingOriginUbigeo: '150122',
      carrierRates: { olva: [900, 1200, 1600, 2200, 2800] },
    });
    jest.spyOn(tools, 'createOrderWithOptionalLink').mockResolvedValue({ traces: [] });
    runtime = new SalesAgentRuntimeService(
      { salesAgent: { findFirst: findAgent } } as unknown as PrismaService,
      { get: (key: string) => key === 'OPENAI_API_KEY' && aiEnabled ? 'fixture-key' : undefined } as unknown as ConfigService,
      tools,
      { getRuntimeKnowledge: async () => ({ faqs: [], journeys: [
        { title: 'Cierre', stage: 'CLOSE', scriptText: closeScript },
        { title: 'Descubrir', stage: 'DISCOVER', scriptText: discoverScript },
      ] }) } as unknown as KnowledgeService,
    );
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({
        replyText: 'Te recomiendo Perfume de prueba. ¿Te lo preparo?',
        productNames: [product.name], usedCatalog: true, escalate: false,
      }) } }] }),
    } as Response);
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([false, true])('answers a greeting without repeating products or calling AI (AI enabled: %s)', async (useAi) => {
    aiEnabled = useAi;
    const earlier = JSON.parse(JSON.stringify(history));
    const reply = await runtime.generateReply({ tenantId: 'tenant-1', inboundText: 'Hola', history });
    expect(reply.replyText).toBe('¡Hola de nuevo! ¿Qué estás buscando hoy?');
    expect(reply.usedCatalog).toBe(false);
    expect(reply.images).toEqual([]);
    expect(reply.tools).toEqual([]);
    expect(history).toEqual(earlier);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tools.createOrderWithOptionalLink).not.toHaveBeenCalled();
  });

  it('honors the configured initial message without exposing discovery instructions', async () => {
    const initialMessage = '¡Hola! ¿Buscas algo para ti o para regalar?';
    findAgent.mockResolvedValue({ initialMessage });
    const reply = await runtime.generateReply({ tenantId: 'tenant-1', inboundText: '¡Hola!' });
    expect(reply.replyText).toBe(initialMessage);
    findAgent.mockResolvedValue(null);
    const defaultReply = await runtime.generateReply({ tenantId: 'tenant-1', inboundText: 'Buenos días' });
    expect(defaultReply.replyText).toContain('¿Qué estás buscando hoy?');
    expect(defaultReply.replyText).not.toContain(discoverScript);
  });

  it('responds to a purchase mixed with a greeting and keeps delivery before payment', async () => {
    const reply = await runtime.generateReply({
      tenantId: 'tenant-1', inboundText: 'Hola, quiero comprar Perfume de prueba', history,
    });
    expect(reply.replyText).toContain('distrito');
    expect(reply.usedCatalog).toBe(true);
    expect(reply.images).toEqual([]);
    expect(tools.createOrderWithOptionalLink).not.toHaveBeenCalled();
  });

  it('keeps resolving the previous product after another greeting', async () => {
    const greeting = await runtime.generateReply({ tenantId: 'tenant-1', inboundText: 'Hola', history });
    const reply = await runtime.generateReply({
      tenantId: 'tenant-1', inboundText: 'Lo quiero',
      history: [...history, { role: 'buyer', text: 'Hola' }, { role: 'agent', text: greeting.replyText }],
    });
    expect(reply.replyText).toContain('distrito');
    expect(reply.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'search_catalog', data: expect.objectContaining({ matchIds: [product.id] }) }),
    ]));
  });

  it('preserves a pending delivery step across a greeting without creating an order', async () => {
    const waiting: ConversationTurn[] = [{
      role: 'agent', text: '¿A qué distrito te lo enviamos?', productIds: [product.id],
      pendingDelivery: { lines: [{ productId: product.id, variantId: null, quantity: 1 }] },
    }];
    const greeting = await runtime.generateReply({ tenantId: 'tenant-1', inboundText: 'Hola', history: waiting });
    expect(tools.createOrderWithOptionalLink).not.toHaveBeenCalled();
    const { history: nextHistory } = buildAgentContext([
      { authorType: 'SALES_AGENT', body: greeting.replyText, metadata: { tools: greeting.tools } },
    ]);
    expect(nextHistory[0].pendingDelivery).toEqual(waiting[0].pendingDelivery);
    const reply = await runtime.generateReply({
      tenantId: 'tenant-1', inboundText: 'Miraflores, Lima', history: nextHistory,
    });
    expect(tools.createOrderWithOptionalLink).toHaveBeenCalledWith(expect.objectContaining({
      lines: [expect.objectContaining({ product })], delivery: expect.objectContaining({ kind: 'quote' }),
    }));
    expect(reply.images).toEqual([]);
  });

  it('uses a buyer-facing closing question in fallback instead of the internal script', async () => {
    const reply = await runtime.generateReply({ tenantId: 'tenant-1', inboundText: product.name });
    expect(reply.replyText).toContain(product.name);
    expect(reply.replyText).toContain('¿Te lo preparo?');
    expect(reply.replyText).not.toContain(closeScript);
  });

  it.each([false, true])('sends photos only on request, including repeat requests (AI enabled: %s)', async (useAi) => {
    aiEnabled = useAi;
    for (const inboundText of [product.name, 'Hola', 'No quiero fotos', 'La foto se ve borrosa']) {
      const reply = await runtime.generateReply({ tenantId: 'tenant-1', inboundText, history });
      expect(reply.images).toEqual([]);
    }
    for (const inboundText of ['Mándame una foto', 'Hola, envíame una foto', 'Quiero otra foto del perfume']) {
      const reply = await runtime.generateReply({
        tenantId: 'tenant-1', inboundText, history, shownImageProductIds: [product.id],
      });
      expect(reply.images).toEqual([expect.objectContaining({ productId: product.id })]);
    }
    if (useAi) {
      const request = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(request.messages[0].content).toContain('El cliente no solicitó fotos: no se enviará ninguna imagen');
      expect(request.messages[0].content).not.toContain('se envía automáticamente');
    }
  });

  it.each([closeScript, 'Si duda entre dos, pregunta cuál le gustó más.'])('rejects an AI reply copying a journey instruction: %s', async (leak) => {
    aiEnabled = true;
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: {
      content: JSON.stringify({ replyText: `${product.name}: ${leak}`, productNames: [product.name] }),
    } }] }) } as Response);
    const reply = await runtime.generateReply({ tenantId: 'tenant-1', inboundText: product.name });
    expect(reply.replyText).not.toContain(leak);
    expect(reply.replyText).toContain('¿Te lo preparo?');
    expect(reply.usedAi).not.toBe(true);
    expect(reply.images).toEqual([]);
  });
});
