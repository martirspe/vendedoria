import { BadRequestException } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { CatalogService } from '../src/catalog/catalog.service';
import { CheckoutService } from '../src/checkout/checkout.service';
import { OrdersService } from '../src/orders/orders.service';
import { PrismaService } from '../src/prisma/prisma.service';

/** Services are catalog items without stock or shipping; the preferred date is never a booking. */
describe('Services in the catalog and the web checkout (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let catalog: CatalogService;
  let checkout: CheckoutService;
  let orders: OrdersService;
  const run = randomBytes(3).toString('hex');
  const slugs = [`svc-${run}`, `svc-other-${run}`];
  let tenantId: string;
  let otherTenantId: string;
  let serviceId: string;
  let variantId: string;
  let goodId: string;

  const customer = {
    name: 'Ana Prueba',
    email: `ana-${run}@example.com`,
    phone: '987654321',
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    catalog = app.get(CatalogService);
    checkout = app.get(CheckoutService);
    orders = app.get(OrdersService);

    const tenants = await Promise.all(
      slugs.map((slug) =>
        prisma.tenant.create({
          data: {
            name: slug,
            slug,
            planTier: 'START',
            planTrial: false,
            planExpiresAt: new Date(Date.now() + 30 * 86_400_000),
            storefront: {
              create: {
                displayName: `Tienda ${slug}`,
                status: 'PUBLISHED',
                whatsappPhone: '51900000000',
                pickupEnabled: true,
                pickupAddress: 'Av. Larco 123, Miraflores',
              },
            },
            integrations: { create: { key: 'store' } },
          },
        }),
      ),
    );
    [tenantId, otherTenantId] = tenants.map((tenant) => tenant.id);

    const good = await catalog.create(tenantId, {
      handle: `polo-${run}`,
      name: 'Polo',
      basePriceCents: 5000,
      stockUnlimited: false,
      stockQty: 10,
      isPublishedOnStore: true,
    });
    goodId = good.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.tenant.deleteMany({
        where: { id: { in: [tenantId, otherTenantId].filter(Boolean) } },
      });
    }
    await app?.close();
  });

  it('creates a service without stock even if stock is sent', async () => {
    const service = await catalog.create(tenantId, {
      handle: `limpieza-${run}`,
      name: 'Limpieza facial',
      basePriceCents: 8000,
      kind: 'SERVICE',
      durationMinutes: 60,
      serviceMode: 'onsite',
      stockUnlimited: false,
      stockQty: 3,
      isPublishedOnStore: true,
      variants: [
        {
          option1Name: 'Duración',
          option1Value: '90 min',
          priceCents: 11000,
          stockQty: 2,
        },
      ],
    });
    serviceId = service.id;
    const stored = await prisma.product.findUniqueOrThrow({
      where: { id: serviceId },
      include: { variants: true },
    });
    expect(stored).toMatchObject({
      kind: 'SERVICE',
      stockUnlimited: true,
      stockQty: null,
      durationMinutes: 60,
    });
    expect(stored.variants.every((variant) => variant.stockQty === null)).toBe(
      true,
    );
    variantId = stored.variants[0].id;
  });

  it('keeps services out of sets and out of inventory', async () => {
    await expect(
      catalog.create(tenantId, {
        handle: `pack-${run}`,
        name: 'Pack',
        basePriceCents: 9000,
        components: [{ productId: serviceId, quantity: 1 }],
      }),
    ).rejects.toThrow('Un servicio no puede ser pieza de un set.');
    await expect(
      catalog.update(tenantId, serviceId, {
        components: [{ productId: goodId, quantity: 1 }],
      }),
    ).rejects.toThrow('Un servicio no puede ser un set.');

    const rows = await catalog.inventory(tenantId);
    expect(JSON.stringify(rows)).not.toContain(serviceId);
    await expect(
      catalog.updateInventory(tenantId, {
        items: [{ productId: serviceId, stockQty: 5 }],
      }),
    ).rejects.toThrow('Los servicios no llevan stock.');
  });

  it('turning a product into a service drops its stock', async () => {
    const item = await catalog.create(tenantId, {
      handle: `asesoria-${run}`,
      name: 'Asesoría',
      basePriceCents: 4000,
      stockUnlimited: false,
      stockQty: 4,
    });
    await catalog.update(tenantId, item.id, {
      kind: 'SERVICE',
      serviceMode: 'online',
    });
    expect(
      await prisma.product.findUniqueOrThrow({ where: { id: item.id } }),
    ).toMatchObject({
      kind: 'SERVICE',
      stockUnlimited: true,
      stockQty: null,
      serviceMode: 'online',
    });
    await catalog.update(tenantId, item.id, { kind: 'PRODUCT' });
    expect(
      await prisma.product.findUniqueOrThrow({ where: { id: item.id } }),
    ).toMatchObject({
      kind: 'PRODUCT',
      durationMinutes: null,
      serviceMode: null,
    });
  });

  it('checks out a services-only cart without delivery and keeps the preferred date', async () => {
    const order = await checkout.create(
      { tenantId, isPreview: false },
      {
        checkoutKey: randomUUID(),
        items: [{ handle: `limpieza-${run}`, variantId, quantity: 1 }],
        customer,
        serviceNote: '  Sábado por la mañana  ',
        acceptTerms: true,
      },
    );
    expect(order.delivery).toBeNull();
    expect(order.serviceNote).toBe('Sábado por la mañana');
    expect(order).toMatchObject({ shippingCents: 0, totalCents: 11000 });

    await orders.updateStatus(tenantId, order.id, { status: 'PAID' });
    await expect(
      orders.updateStatus(tenantId, order.id, {
        status: 'SHIPPED',
        trackingCode: 'X1',
      }),
    ).rejects.toThrow(
      'Un pedido de servicios no se envía: márcalo como realizado.',
    );
    const done = await orders.updateStatus(tenantId, order.id, {
      status: 'COMPLETED',
    });
    expect(done.status).toBe('COMPLETED');
  });

  it('requires delivery when the cart also has products, and drops the note without services', async () => {
    await expect(
      checkout.create(
        { tenantId, isPreview: false },
        {
          checkoutKey: randomUUID(),
          items: [
            { handle: `limpieza-${run}`, variantId, quantity: 1 },
            { handle: `polo-${run}`, quantity: 1 },
          ],
          customer,
          acceptTerms: true,
        },
      ),
    ).rejects.toThrow(new BadRequestException('Elige una forma de entrega.'));

    const order = await checkout.create(
      { tenantId, isPreview: false },
      {
        checkoutKey: randomUUID(),
        items: [{ handle: `polo-${run}`, quantity: 1 }],
        customer,
        delivery: { mode: 'PICKUP' },
        serviceNote: 'Mañana',
        acceptTerms: true,
      },
    );
    expect(order.delivery).toMatchObject({ mode: 'PICKUP' });
    expect(order.serviceNote).toBeNull();
  });

  it('never sells another tenant service', async () => {
    await expect(
      checkout.create(
        { tenantId: otherTenantId, isPreview: false },
        {
          checkoutKey: randomUUID(),
          items: [{ handle: `limpieza-${run}`, quantity: 1 }],
          customer,
          acceptTerms: true,
        },
      ),
    ).rejects.toThrow('Un producto de tu carrito ya no está disponible.');
  });
});
