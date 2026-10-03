import { BadRequestException } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { buildAgentContext } from '../src/agent-runtime/conversation-context';
import { SalesAgentRuntimeService } from '../src/agent-runtime/sales-agent-runtime.service';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ShippingService } from '../src/shipping/shipping.service';

/** Shipping belongs to the business: it works and is quoted by the agent without the store add-on. */
describe('Shipping without the store (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let shipping: ShippingService;
  let runtime: SalesAgentRuntimeService;
  const run = randomBytes(3).toString('hex');
  const slug = `ship-${run}`;
  let tenantId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    shipping = app.get(ShippingService);
    runtime = app.get(SalesAgentRuntimeService);

    const tenant = await prisma.tenant.create({
      data: {
        name: slug,
        slug,
        planTier: 'START',
        planTrial: false,
        planExpiresAt: new Date(Date.now() + 30 * 86_400_000),
        salesAgents: { create: { name: 'Sofía', companyName: 'Casa Prueba' } },
        products: { create: { handle: `zentro-${run}`, name: 'Zentro', basePriceCents: 12000 } },
      },
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    if (prisma && tenantId) {
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await app?.close();
  });

  it('requires a session', async () => {
    expect((await app.inject({ method: 'GET', url: '/shipping' })).statusCode).toBe(401);
  });

  it('saves delivery modes with the store add-on off', async () => {
    expect((await shipping.get(tenantId)).options).toEqual([]);
    await expect(shipping.update(tenantId, { shippingOriginUbigeo: '999999' })).rejects.toThrow(BadRequestException);

    const view = await shipping.update(tenantId, {
      deliveryEnabled: true,
      shippingOriginUbigeo: '150122',
      carrierRates: { olva: [900, 1200, 1600, 2200, 2800], shalom: [800, 1300, 1500, 2000, 2600] },
      pickupEnabled: true,
      pickupAddress: 'Av. Larco 123, Miraflores',
    });
    expect(view.options.map((option) => option.mode)).toEqual(['OLVA', 'SHALOM', 'PICKUP']);
  });

  it('asks for the district, then quotes shipping into the order and its payment link', async () => {
    const buy = 'Quiero comprar el Zentro';
    const first = await runtime.generateReply({ tenantId, inboundText: buy, mode: 'production', allowAi: false });
    expect(first.checkoutUrl).toBeUndefined();
    expect(first.orderId).toBeUndefined();
    expect(first.replyText).toContain('distrito');
    expect(first.replyText).toContain('Av. Larco 123, Miraflores');

    const { history } = buildAgentContext([
      { authorType: 'BUYER', body: buy },
      { authorType: 'SALES_AGENT', body: first.replyText, metadata: { tools: first.tools } },
    ]);
    const second = await runtime.generateReply({
      tenantId,
      inboundText: 'San Juan de Lurigancho',
      history,
      mode: 'production',
      allowAi: false,
    });
    expect(second.checkoutUrl).toBeTruthy();
    expect(second.replyText).toContain('Envío con Shalom a San Juan de Lurigancho, Lima: PEN 8.00');
    expect(second.replyText).toContain('Total: PEN 128.00');

    const order = await prisma.order.findFirstOrThrow({ where: { id: second.orderId, tenantId } });
    expect(order).toMatchObject({ subtotalCents: 12000, shippingCents: 800, totalCents: 12800 });
    expect(order.delivery).toMatchObject({ mode: 'SHALOM', ubigeo: '150132', district: 'San Juan de Lurigancho' });
  });
});
