import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { randomBytes } from 'node:crypto';
import Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConversationsService } from '../src/conversations/conversations.service';
import { SalesGatewayService } from '../src/conversations/sales-gateway.service';
import { SalesConversationLock } from '../src/agent-runtime/sales-lock.service';
import { SalesMemoryService } from '../src/agent-runtime/sales-memory.service';
import {
  SalesSearchService,
  pointId,
} from '../src/agent-runtime/sales-search.service';
import { SalesAgentToolsService } from '../src/agent-runtime/sales-agent-tools.service';
import { SalesEngineOpsService } from '../src/agent-runtime/sales-engine-ops.service';
import { ChannelMessengerService } from '../src/channels/channel-messenger.service';
import { PlanLimitsService } from '../src/billing/plan-limits.service';
import { OrderEmailService } from '../src/checkout/order-email.service';
import { ConversionInfrastructure } from '../src/conversion/conversion-infrastructure.service';
import {
  initialSalesState,
  observeBuyer,
} from '../src/agent-runtime/sales-state';

/** Real PostgreSQL/Redis/Qdrant, isolated DB, synthetic embedding fixture, no external sends/charges. */
describe('AI Sales Engine integration (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let conversations: ConversationsService;
  let gateway: SalesGatewayService;
  let config: ConfigService;
  let redis: Redis;
  let tenantA: string,
    tenantB: string,
    channelA: string,
    channelB: string,
    productA: string,
    productB: string;
  let send: jest.SpyInstance;
  const run = randomBytes(6).toString('hex');
  let number = 0;
  const phoneA = `sales-phone-${run}-a`,
    phoneB = `sales-phone-${run}-b`;
  const inbound = (
    thread: string,
    text: string,
    id = `${run}-${number++}`,
    phoneNumberId = phoneA,
  ) =>
    conversations.ingestInboundWhatsApp({
      phoneNumberId,
      fromPhone: thread,
      text,
      externalMessageId: id,
    });
  const vector = Array<number>(1536).fill(0);
  vector[0] = 1;
  const nativeFetch = global.fetch;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    prisma = app.get(PrismaService);
    config = app.get(ConfigService);
    if (!config.get<string>('DATABASE_URL')?.includes('/vendedoria_test?'))
      throw new Error(
        'Sales e2e requires the isolated vendedoria_test database',
      );
    config.set('SALES_ENGINE_MODE', 'sales-engine-v2');
    config.set('SALES_DEBOUNCE_MS', 0);
    config.set('OPENAI_API_KEY', '');
    conversations = app.get(ConversationsService);
    gateway = app.get(SalesGatewayService);
    const tenant = async (suffix: string) =>
      prisma.tenant.create({
        data: {
          slug: `sales-${run}-${suffix}`,
          name: `Fixture ${suffix}`,
          channels: {
            create: {
              type: 'WHATSAPP',
              externalId: suffix === 'a' ? phoneA : phoneB,
              displayName: 'Fixture',
              healthStatus: 'CONNECTED',
            },
          },
          products: {
            create: {
              handle: 'shoe',
              name: `Zapatilla negra ${suffix}`,
              categories: ['Zapatillas'],
              basePriceCents: 15000,
              stockUnlimited: false,
              stockQty: 2,
              variants: {
                create: {
                  option1Name: 'Talla',
                  option1Value: '40',
                  priceCents: 15000,
                  stockQty: 2,
                },
              },
            },
          },
        },
        include: { channels: true, products: true },
      });
    const a = await tenant('a'),
      b = await tenant('b');
    tenantA = a.id;
    tenantB = b.id;
    channelA = a.channels[0].id;
    channelB = b.channels[0].id;
    productA = a.products[0].id;
    productB = b.products[0].id;
    send = jest
      .spyOn(app.get(ChannelMessengerService), 'sendText')
      .mockImplementation(async () => ({
        ok: true,
        messageId: `out-${number++}`,
      }));
    jest
      .spyOn(app.get(ChannelMessengerService), 'sendPaymentLink')
      .mockImplementation(async () => ({
        ok: true,
        messageId: `out-${number++}`,
      }));
    jest
      .spyOn(app.get(PlanLimitsService), 'assertCanStartConversation')
      .mockResolvedValue();
    jest.spyOn(app.get(PlanLimitsService), 'canUseAi').mockResolvedValue(false);
    jest
      .spyOn(app.get(OrderEmailService), 'sendHandoffAlert')
      .mockResolvedValue(undefined as never);
    redis = new Redis('redis://redis:6379/15', { maxRetriesPerRequest: 1 });
    Object.defineProperty(app.get(ConversionInfrastructure), 'redis', {
      value: redis,
    });
  }, 30000);
  afterAll(async () => {
    config?.set('OPENAI_API_KEY', '');
    if (prisma && tenantA)
      await prisma.tenant.deleteMany({
        where: { id: { in: [tenantA, tenantB] } },
      });
    jest.restoreAllMocks();
    await app?.close();
  });
  beforeEach(() => send?.mockClear());

  it('D/E: concurrent rapid messages and duplicate wamid produce one reply', async () => {
    const id = `${run}-duplicate`;
    const captures = await Promise.all([
      inbound('burst', 'Hola', id),
      inbound('burst', 'Hola', id),
    ]);
    expect(captures.filter((r) => 'duplicate' in r)).toHaveLength(1);
    await inbound('burst', 'quiero zapatillas');
    await inbound('burst', 'negras');
    await inbound('burst', 'talla 40');
    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { tenantId: tenantA, externalThreadId: 'burst' },
    });
    await Promise.all([
      gateway.process(tenantA, conversation.id),
      gateway.process(tenantA, conversation.id),
    ]);
    expect(
      await prisma.salesEngineTurn.findMany({
        where: { tenantId: tenantA, conversationId: conversation.id },
        select: { status: true, trace: true },
      }),
    ).toEqual([expect.objectContaining({ status: 'SENT' })]);
    expect(send).toHaveBeenCalledTimes(1);
    const stored = await prisma.conversation.findFirstOrThrow({
      where: { id: conversation.id, tenantId: tenantA },
    });
    expect(
      (stored.salesState as { requirements: { size: { value: string } } })
        .requirements.size.value,
    ).toBe('40');
    expect(
      await prisma.message.count({
        where: { conversationId: conversation.id, direction: 'INBOUND' },
      }),
    ).toBe(4);
    expect(
      await prisma.salesEngineTurn.count({
        where: {
          tenantId: tenantA,
          conversationId: conversation.id,
          status: 'SENT',
        },
      }),
    ).toBe(1);
  });
  it('does not execute a turn before the configured quiet window', async () => {
    await inbound('debounce', 'Hola');
    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { tenantId: tenantA, externalThreadId: 'debounce' },
    });
    config.set('SALES_DEBOUNCE_MS', 10000);
    await gateway.process(tenantA, conversation.id);
    expect(send).not.toHaveBeenCalled();
    config.set('SALES_DEBOUNCE_MS', 0);
    await gateway.process(tenantA, conversation.id);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('tenant/channel message namespaces allow the same wamid without cross-tenant dedup', async () => {
    const id = `${run}-shared`;
    await inbound('shared', 'Hola', id);
    await inbound('shared', 'Hola', id, phoneB);
    expect(
      await prisma.message.count({
        where: { externalId: id, direction: 'INBOUND' },
      }),
    ).toBe(2);
    await expect(
      app
        .get(SalesEngineOpsService)
        .diagnose(
          tenantB,
          (
            await prisma.conversation.findFirstOrThrow({
              where: { tenantId: tenantA, externalThreadId: 'shared' },
            })
          ).id,
        ),
    ).rejects.toThrow('Conversación no encontrada');
  });
  it('PostgreSQL fences concurrent owners even after a Redis lease expires', async () => {
    const locks = app.get(SalesConversationLock);
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((r) => {
      enter = r;
    });
    const finish = new Promise<void>((r) => {
      release = r;
    });
    const first = locks.run(tenantA, 'fence', async () => {
      enter();
      await finish;
      return 'first';
    });
    await entered;
    await redis.del(`wa:lock:${tenantA}:fence`);
    expect(
      await locks.run(tenantA, 'fence', async () => 'second'),
    ).toBeUndefined();
    release();
    expect(await first).toBe('first');
    expect(await redis.get(`wa:lock:${tenantA}:fence`)).toBeNull();
  });
  it('Redis ownership-safe release cannot delete a replacement lease', async () => {
    const locks = app.get(SalesConversationLock);
    await locks.run(tenantA, 'replacement', async () => {
      await redis.set(`wa:lock:${tenantA}:replacement`, 'other', 'EX', 30);
    });
    expect(await redis.get(`wa:lock:${tenantA}:replacement`)).toBe('other');
    await redis.del(`wa:lock:${tenantA}:replacement`);
  });
  it('paused conversations and operator takeover suppress the automatic reply', async () => {
    await inbound('paused', 'Busco zapatillas');
    const c = await prisma.conversation.findFirstOrThrow({
      where: { tenantId: tenantA, externalThreadId: 'paused' },
    });
    await conversations.updateFlags(tenantA, c.id, { agentEnabled: false });
    await gateway.process(tenantA, c.id);
    expect(send).not.toHaveBeenCalled();
    expect(
      await prisma.message.count({
        where: { conversationId: c.id, enginePending: true },
      }),
    ).toBe(0);
  });
  it('uncertain sends and interrupted actions are never blindly retried', async () => {
    await inbound('uncertain', 'Hola');
    const c = await prisma.conversation.findFirstOrThrow({
      where: { tenantId: tenantA, externalThreadId: 'uncertain' },
    });
    send.mockResolvedValueOnce({ ok: false, error: 'fixture-timeout' });
    await gateway.process(tenantA, c.id);
    await gateway.process(tenantA, c.id);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      await prisma.salesEngineTurn.count({
        where: { tenantId: tenantA, conversationId: c.id, status: 'UNKNOWN' },
      }),
    ).toBe(1);
    expect(
      (
        await prisma.conversation.findFirstOrThrow({
          where: { id: c.id, tenantId: tenantA },
        })
      ).agentEnabled,
    ).toBe(false);
    await inbound('interrupted', 'Hola');
    const interrupted = await prisma.conversation.findFirstOrThrow({
      where: { tenantId: tenantA, externalThreadId: 'interrupted' },
    });
    const message = await prisma.message.findFirstOrThrow({
      where: { conversationId: interrupted.id },
    });
    await prisma.salesEngineTurn.create({
      data: {
        tenantId: tenantA,
        conversationId: interrupted.id,
        inboundIds: [message.id],
        status: 'STARTED',
      },
    });
    send.mockClear();
    await gateway.process(tenantA, interrupted.id);
    expect(send).not.toHaveBeenCalled();
  });
  it('customer memory is explicit, expiring and tenant-scoped; Redis loss reconstructs state', async () => {
    const memory = app.get(SalesMemoryService);
    const key = memory.customerKey(channelA, 'customer');
    const state = observeBuyer(
      initialSalesState(),
      'Me llamo Ana. Siempre prefiero perfumes florales',
      'm1',
    );
    await memory.saveCustomer(tenantA, key, state);
    expect((await memory.loadCustomer(tenantA, key)).name.value).toBe('Ana');
    expect(await memory.loadCustomer(tenantB, key)).toEqual({});
    await redis.set(
      `wa:state:${tenantA}:memory`,
      JSON.stringify({ ...state, turns: 99 }),
      'EX',
      30,
    );
    expect(await memory.readState(tenantA, 'memory', state)).toEqual(state);
    await redis.del(`wa:state:${tenantA}:memory`);
    expect(await memory.readState(tenantA, 'memory', state)).toEqual(state);
    await redis.del(`wa:state:${tenantA}:memory`);
    await prisma.salesCustomerMemory.updateMany({
      where: { tenantId: tenantA, customerKey: key },
      data: { expiresAt: new Date(0) },
    });
    expect(await memory.loadCustomer(tenantA, key)).toEqual({});
  });
  it('G/I: real Qdrant candidates are tenant-filtered and prices hydrate from PostgreSQL', async () => {
    config.set('QDRANT_URL', 'http://qdrant:6333');
    config.set('OPENAI_API_KEY', 'fixture-embedding-only');
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (input, init) => {
        if (String(input) === 'https://api.openai.com/v1/embeddings')
          return {
            ok: true,
            json: async () => ({ data: [{ embedding: vector }] }),
          } as Response;
        return nativeFetch(input, init);
      });
    const search = app.get(SalesSearchService);
    try {
      const page = await search.backfill(tenantA, 'product');
      expect(page.queued).toBe(1);
      await search.flush();
      const candidates = await search.candidates(
        tenantA,
        'zapatillas para caminar',
        'product',
      );
      expect(candidates).toContain(productA);
      expect(candidates).not.toContain(productB);
      // Stale/hostile vector payload contains a false price; the serving path ignores it.
      const changed = await nativeFetch(
        `http://qdrant:6333/collections/${search.collection}/points?wait=true`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: [
              {
                id: pointId(tenantA, 'product', productA),
                vector,
                payload: {
                  tenantId: tenantA,
                  sourceId: productA,
                  documentType: 'product',
                  active: true,
                  priceCents: 1,
                },
              },
            ],
          }),
        },
      );
      expect(changed.ok).toBe(true);
      const tools = app.get(SalesAgentToolsService);
      const products = await tools.listAvailableProducts(
        tenantA,
        [],
        [],
        'zapatillas para caminar',
      );
      expect(products.find((p) => p.id === productA)?.basePriceCents).toBe(
        15000,
      );
      expect(products.some((p) => p.id === productB)).toBe(false);
      await prisma.product.updateMany({
        where: { tenantId: tenantA, id: productA },
        data: { basePriceCents: 16000 },
      });
      await prisma.productVariant.updateMany({
        where: { product: { tenantId: tenantA, id: productA } },
        data: { priceCents: 16000 },
      });
      expect(
        (await tools.getProducts(tenantA, [productA]))[0].basePriceCents,
      ).toBe(16000);
      await prisma.product.updateMany({
        where: { tenantId: tenantA, id: productA },
        data: { isAvailable: false },
      });
      expect(await tools.getProducts(tenantA, [productA, productB])).toEqual(
        [],
      );
      await search.flush();
      expect(
        await search.candidates(tenantA, 'zapatillas', 'product'),
      ).not.toContain(productA);
      await prisma.product.updateMany({
        where: { tenantId: tenantA, id: productA },
        data: { isAvailable: true, basePriceCents: 15000 },
      });
      // Remove test points only, never a shared collection.
      await nativeFetch(
        `http://qdrant:6333/collections/${search.collection}/points/delete?wait=true`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: {
              should: [
                { key: 'tenantId', match: { value: tenantA } },
                { key: 'tenantId', match: { value: tenantB } },
              ],
            },
          }),
        },
      );
    } finally {
      fetchSpy.mockRestore();
      config.set('OPENAI_API_KEY', '');
    }
  }, 30000);
  it('semantic index outbox rolls back with writes and ignores price/stock-only changes', async () => {
    const job = await prisma.salesSearchJob.findFirstOrThrow({
      where: { tenantId: tenantA, sourceId: productA },
    });
    await prisma.product.updateMany({
      where: { tenantId: tenantA, id: productA },
      data: { stockQty: 1, basePriceCents: 15100 },
    });
    expect(
      (
        await prisma.salesSearchJob.findFirstOrThrow({
          where: { id: job.id, tenantId: tenantA },
        })
      ).revision,
    ).toBe(job.revision);
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.product.updateMany({
          where: { id: productA, tenantId: tenantA },
          data: { name: 'Rolled back semantic change' },
        });
        throw new Error('fixture rollback');
      }),
    ).rejects.toThrow('fixture rollback');
    expect(
      (
        await prisma.salesSearchJob.findFirstOrThrow({
          where: { id: job.id, tenantId: tenantA },
        })
      ).revision,
    ).toBe(job.revision);
    await prisma.product.updateMany({
      where: { tenantId: tenantA, id: productA },
      data: { descriptionShort: 'Semantic update' },
    });
    expect(
      (
        await prisma.salesSearchJob.findFirstOrThrow({
          where: { id: job.id, tenantId: tenantA },
        })
      ).revision,
    ).toBe(job.revision + 1);
  });
  it('approved FAQ retrieval is isolated, refreshes on edit and removes unpublished sources', async () => {
    const faqA = await prisma.knowledgeFaq.create({
      data: {
        tenantId: tenantA,
        question: '¿Cómo funcionan los cambios?',
        answer: 'Cambios dentro de siete días con comprobante.',
        reviewStatus: 'APPROVED',
        isPublished: true,
      },
    });
    await prisma.knowledgeFaq.create({
      data: {
        tenantId: tenantB,
        question: '¿Cómo funcionan los cambios?',
        answer: 'Condiciones de otro negocio.',
        reviewStatus: 'APPROVED',
        isPublished: true,
      },
    });
    config.set('QDRANT_URL', 'http://qdrant:6333');
    config.set('OPENAI_API_KEY', 'fixture-embedding-only');
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (input, init) =>
        String(input) === 'https://api.openai.com/v1/embeddings'
          ? ({
              ok: true,
              json: async () => ({ data: [{ embedding: vector }] }),
            } as Response)
          : nativeFetch(input, init),
      );
    const search = app.get(SalesSearchService);
    try {
      await search.backfill(tenantA, 'faq');
      await search.flush();
      expect(
        await search.candidates(tenantA, 'política de cambios', 'faq'),
      ).toEqual([faqA.id]);
      await prisma.knowledgeFaq.updateMany({
        where: { tenantId: tenantA, id: faqA.id },
        data: { isPublished: false },
      });
      await search.flush();
      expect(
        await search.candidates(tenantA, 'política de cambios', 'faq'),
      ).toEqual([]);
    } finally {
      fetchSpy.mockRestore();
      config.set('OPENAI_API_KEY', '');
      await nativeFetch(
        `http://qdrant:6333/collections/${search.collection}/points/delete?wait=true`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: {
              should: [
                { key: 'tenantId', match: { value: tenantA } },
                { key: 'tenantId', match: { value: tenantB } },
              ],
            },
          }),
        },
      );
    }
  }, 30000);
  it('backfill is paginated, resumable and tenant-scoped', async () => {
    await prisma.product.createMany({
      data: Array.from({ length: 101 }, (_, i) => ({
        tenantId: tenantA,
        handle: `backfill-${i}`,
        name: `Fixture ${i}`,
        basePriceCents: 1000,
      })),
    });
    const search = app.get(SalesSearchService);
    const first = await search.backfill(tenantA, 'product');
    expect(first.queued).toBe(100);
    expect(first.nextCursor).not.toBeNull();
    const second = await search.backfill(tenantA, 'product', first.nextCursor!);
    expect(second.queued).toBe(2);
    expect(second.nextCursor).toBeNull();
    expect(
      await prisma.salesSearchJob.count({
        where: { tenantId: tenantA, sourceId: productB },
      }),
    ).toBe(0);
  });
});
