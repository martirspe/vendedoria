import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NestFastifyApplication,
  FastifyAdapter,
} from '@nestjs/platform-fastify';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { LiveService } from '../src/live/live.service';
import { CheckoutService } from '../src/checkout/checkout.service';
import { TikTokIntegrationService } from '../src/live/tiktok-integration.service';
import type { AuthUserPayload } from '../src/common/types/auth-user';
import type { PublicOrder } from '@vendedoria/contracts';
import { TikTokClient } from '../src/live/tiktok-client';
import { decryptSecret } from '../src/payments/credentials-cipher';

describe('LIVE sales (isolated PostgreSQL)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let live: LiveService;
  let checkout: CheckoutService;
  const run = randomBytes(5).toString('hex');
  const tenantIds: string[] = [];
  const users: AuthUserPayload[] = [];
  const userIds: string[] = [];
  let agent: AuthUserPayload;
  const slugs: string[] = [];
  let config: ConfigService;
  let jwt: JwtService;
  let productId = '';
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { rawBody: true },
    );
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    live = app.get(LiveService);
    checkout = app.get(CheckoutService);
    config = app.get(ConfigService);
    jwt = app.get(JwtService);
    for (const suffix of ['a', 'b']) {
      const slug = `live-${suffix}-${run}`;
      const tenant = await prisma.tenant.create({
        data: {
          name: 'LIVE test fixture',
          slug,
          planTier: 'GROW',
          planTrial: false,
          planExpiresAt: null,
          storefront: {
            create: {
              status: 'PUBLISHED',
              displayName: 'LIVE fixture',
              pickupEnabled: true,
              pickupAddress: 'Fixture pickup',
              deliveryEnabled: false,
            },
          },
          integrations: {
            create: [
              { key: 'store', enabled: true },
              { key: 'tiktok_live', enabled: true },
            ],
          },
        },
      });
      tenantIds.push(tenant.id);
      slugs.push(slug);
      const user = await prisma.user.create({ data: {
        email: `${slug}@example.test`, passwordHash: 'unused-test-hash',
        memberships: { create: { tenantId: tenant.id, role: 'OWNER' } },
      } });
      userIds.push(user.id);
      users.push({
        userId: user.id,
        email: user.email,
        tenantId: tenant.id,
        membershipRole: 'OWNER',
      });
    }
    const agentUser = await prisma.user.create({ data: {
      email: `live-agent-${run}@example.test`, passwordHash: 'unused-test-hash',
      memberships: { create: { tenantId: tenantIds[0], role: 'AGENT' } },
    } });
    userIds.push(agentUser.id);
    agent = { userId: agentUser.id, email: agentUser.email, tenantId: tenantIds[0], membershipRole: 'AGENT' };
    const product = await prisma.product.create({
      data: {
        tenantId: tenantIds[0],
        name: 'Last unit',
        handle: 'last-unit',
        basePriceCents: 17900,
        stockUnlimited: false,
        stockQty: 1,
        isPublishedOnStore: true,
      },
    });
    productId = product.id;
  }, 30000);
  afterAll(async () => {
    if (prisma && tenantIds.length) {
      await prisma.liveEvent.deleteMany({
        where: { tenantId: { in: tenantIds } },
      });
      await prisma.liveReservation.deleteMany({
        where: { tenantId: { in: tenantIds } },
      });
      await prisma.liveCampaign.deleteMany({
        where: { tenantId: { in: tenantIds } },
      });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
    if (prisma && userIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });
  const token = (user: AuthUserPayload) =>
    jwt.sign(
      {
        sub: user.userId,
        email: user.email,
        tenantId: user.tenantId,
        membershipRole: user.membershipRole,
      },
      { secret: config.getOrThrow<string>('JWT_ACCESS_SECRET') },
    );
  async function session(stock = 1) {
    await prisma.product.update({
      where: { id: productId },
      data: { stockQty: stock },
    });
    const campaign = await live.saveCampaign(users[0], {
      name: 'Fixture liquidation',
      mode: 'LIVE_LIQUIDATION',
      reservationSeconds: 300,
      products: [
        {
          productId,
          livePriceCents: 11900,
          allocatedStock: stock,
          maxPerCustomer: 2,
          durationSeconds: 3600,
        },
      ],
    });
    const started = await live.start(users[0], campaign.id);
    const panel = await live.panel(tenantIds[0], started.id);
    return {
      id: started.id,
      offerId: panel.products[0].id,
      campaignId: campaign.id,
    };
  }
  it('allows only one buyer to reserve the last unit under real concurrent transactions', async () => {
    const s = await session();
    const results = await Promise.allSettled(
      ['buyer-a', 'buyer-b'].map((customerAlias) =>
        live.reserve(tenantIds[0], s.id, {
          customerAlias,
          offerId: s.offerId,
          quantity: 1,
          idempotencyKey: randomUUID(),
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: productId } }))
        .stockQty,
    ).toBe(0);
    expect(
      (await prisma.liveOffer.findUniqueOrThrow({ where: { id: s.offerId } }))
        .claimedQty,
    ).toBe(1);
    const winner = results.find(
      (
        r,
      ): r is PromiseFulfilledResult<
        Awaited<ReturnType<LiveService['reserve']>>
      > => r.status === 'fulfilled',
    )!;
    await live.cancel(tenantIds[0], winner.value.id);
  });
  it('transfers the hold into the existing checkout, applies LIVE price, and settles payment once', async () => {
    const s = await session();
    const key = randomUUID();
    const input = {
      customerAlias: 'checkout-buyer',
      offerId: s.offerId,
      quantity: 1,
      idempotencyKey: key,
    };
    const reservation = await live.reserve(tenantIds[0], s.id, input);
    expect((await live.reserve(tenantIds[0], s.id, input)).id).toBe(
      reservation.id,
    );
    const liveToken = new URL(reservation.checkoutUrl).searchParams.get(
      'live',
    )!;
    const foreign = await app.inject({
      method: 'POST',
      url: `/api/v1/storefront/${slugs[1]}/live-reservation`,
      payload: { token: liveToken },
    });
    expect(foreign.statusCode).toBe(404);
    const body = {
      checkoutKey: randomUUID(),
      liveReservationToken: liveToken,
      items: [{ handle: 'last-unit', quantity: 1 }],
      customer: {
        name: 'Fixture Buyer',
        email: 'buyer@example.test',
        phone: '999999999',
      },
      delivery: { mode: 'PICKUP' },
      acceptTerms: true,
    };
    const requests = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: 'POST',
          url: `/api/v1/storefront/${slugs[0]}/checkout`,
          payload: body,
        }),
      ),
    );
    expect(requests.map((r) => r.statusCode)).toEqual([201, 201]);
    const order = requests[0].json<PublicOrder>();
    expect(requests[1].json<PublicOrder>().id).toBe(order.id);
    expect(order.subtotalCents).toBe(11900);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: productId } }))
        .stockQty,
    ).toBe(0);
    const paid = await app.inject({
      method: 'POST',
      url: `/api/v1/storefront/${slugs[0]}/orders/${order.id}/simulate`,
      payload: { token: order.token },
    });
    expect(paid.statusCode).toBe(200);
    await app.inject({
      method: 'POST',
      url: `/api/v1/storefront/${slugs[0]}/orders/${order.id}/simulate`,
      payload: { token: order.token },
    });
    expect(
      (
        await prisma.liveReservation.findUniqueOrThrow({
          where: { id: reservation.id },
        })
      ).status,
    ).toBe('CONVERTED');
    expect(
      await prisma.liveEvent.count({
        where: {
          tenantId: tenantIds[0],
          sessionId: s.id,
          kind: 'live_purchase',
        },
      }),
    ).toBe(1);
    expect((await live.panel(tenantIds[0], s.id)).analytics.sales).toBe(1);
  });
  it('settles concurrent official commerce payment updates for a LIVE order only once', async () => {
    const s = await session();
    const reservation = await live.reserve(tenantIds[0], s.id, {
      customerAlias: 'provider-fixture',
      offerId: s.offerId,
      quantity: 1,
      idempotencyKey: randomUUID(),
    });
    const liveToken = new URL(reservation.checkoutUrl).searchParams.get(
      'live',
    )!;
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/storefront/${slugs[0]}/checkout`,
      payload: {
        checkoutKey: randomUUID(),
        liveReservationToken: liveToken,
        items: [{ handle: 'last-unit', quantity: 1 }],
        customer: {
          name: 'Fixture',
          email: 'provider@example.test',
          phone: '999999999',
        },
        delivery: { mode: 'PICKUP' },
        acceptTerms: true,
      },
    });
    expect(response.statusCode).toBe(201);
    const order = response.json<PublicOrder>();
    const providerId = `ORD${randomBytes(10).toString('hex')}`;
    await prisma.payment.create({
      data: {
        tenantId: tenantIds[0],
        orderId: order.id,
        flow: 'COMMERCE_CHECKOUT',
        status: 'PENDING',
        amountCents: order.totalCents,
        currency: 'PEN',
        externalId: providerId,
        idempotencyKey: randomUUID(),
      },
    });
    const paid = {
      id: providerId,
      external_reference: order.id,
      currency: 'PEN',
      total_amount: '119.00',
      total_paid_amount: '119.00',
      status: 'processed',
      status_detail: 'accredited',
    };
    await Promise.all([
      checkout.applyProviderOrder(tenantIds[0], paid),
      checkout.applyProviderOrder(tenantIds[0], paid),
    ]);
    expect(
      (
        await prisma.liveReservation.findUniqueOrThrow({
          where: { id: reservation.id },
        })
      ).status,
    ).toBe('CONVERTED');
    expect(
      await prisma.liveEvent.count({
        where: {
          tenantId: tenantIds[0],
          reservationId: reservation.id,
          kind: 'live_purchase',
        },
      }),
    ).toBe(1);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: productId } }))
        .stockQty,
    ).toBe(0);
  });
  it('expires and cancels atomically and returns inventory exactly once', async () => {
    const s = await session();
    const reservation = await live.reserve(tenantIds[0], s.id, {
      customerAlias: 'expiry-buyer',
      offerId: s.offerId,
      quantity: 1,
      idempotencyKey: randomUUID(),
    });
    await prisma.liveReservation.update({
      where: { id: reservation.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await Promise.all([checkout.expireDue(), checkout.expireDue()]);
    await live.cancel(tenantIds[0], reservation.id);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: productId } }))
        .stockQty,
    ).toBe(1);
    expect(
      (await prisma.liveOffer.findUniqueOrThrow({ where: { id: s.offerId } }))
        .claimedQty,
    ).toBe(0);
    expect(
      await prisma.liveEvent.count({
        where: {
          tenantId: tenantIds[0],
          reservationId: reservation.id,
          kind: 'live_reservation_expired',
        },
      }),
    ).toBe(1);
  });
  it('enforces tenant isolation, manager permissions, capabilities and DTO boundaries', async () => {
    const s = await session();
    const request = (
      url: string,
      user: AuthUserPayload,
      method: 'GET' | 'PUT' = 'GET',
      payload?: object,
    ) =>
      app.inject({
        url: `/api/v1/${url}`,
        method,
        headers: { authorization: `Bearer ${token(user)}` },
        ...(payload ? { payload } : {}),
      });
    expect((await request(`live/sessions/${s.id}`, users[1])).statusCode).toBe(
      404,
    );
    const settings = {
      responseMode: 'HUMAN_APPROVAL',
      reservationSeconds: 300,
      maxReservationsPerSession: 50,
    };
    expect(
      (
        await request(
          'integrations/tiktok-live',
          agent,
          'PUT',
          settings,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request('integrations/tiktok-live', users[0], 'PUT', {
          ...settings,
          responseMode: 'AUTO',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request('integrations/tiktok-live', users[0], 'PUT', {
          ...settings,
          tenantId: tenantIds[1],
        })
      ).statusCode,
    ).toBe(400);
    await expect(
      live.saveCampaign(users[1], {
        name: 'Foreign product',
        mode: 'LIVE_SALE',
        reservationSeconds: 300,
        products: [
          {
            productId,
            livePriceCents: 11900,
            allocatedStock: 1,
            maxPerCustomer: 1,
            durationSeconds: 3600,
          },
        ],
      }),
    ).rejects.toThrow();
    await prisma.tenantIntegration.update({
      where: { tenantId_key: { tenantId: tenantIds[0], key: 'tiktok_live' } },
      data: { enabled: false },
    });
    expect((await request(`live/sessions/${s.id}`, users[0])).statusCode).toBe(
      403,
    );
    await prisma.tenantIntegration.update({
      where: { tenantId_key: { tenantId: tenantIds[0], key: 'tiktok_live' } },
      data: { enabled: true },
    });
  });
  it('deduplicates manual inbound messages and respects HUMAN_ONLY', async () => {
    const s = await session(2);
    const dto = {
      customerAlias: 'intent-buyer',
      text: 'quiero 2',
      eventId: randomUUID(),
    };
    await Promise.all([
      live.message(tenantIds[0], s.id, dto),
      live.message(tenantIds[0], s.id, dto),
    ]);
    expect((await live.panel(tenantIds[0], s.id)).analytics.buyIntents).toBe(1);
    expect((await live.panel(tenantIds[0], s.id)).analytics.messages).toBe(1);
    await app.get(TikTokIntegrationService).settings(users[0], {
      responseMode: 'HUMAN_ONLY',
      reservationSeconds: 300,
      maxReservationsPerSession: 500,
    });
    await live.message(tenantIds[0], s.id, {
      ...dto,
      eventId: randomUUID(),
      text: 'precio?',
    });
    const panel = await live.panel(tenantIds[0], s.id);
    expect(panel.messages[0].suggestedReply).toBeNull();
  });
  it('binds OAuth to the initiating browser, consumes state once and saves refresh rotation on failed validation', async () => {
    config.set('TIKTOK_CLIENT_KEY', 'fixture-client');
    config.set('TIKTOK_CLIENT_SECRET', 'fixture-secret');
    config.set(
      'TIKTOK_REDIRECT_URI',
      'https://api.example.test/api/v1/integrations/tiktok-live/oauth/callback',
    );
    config.set('PAYMENT_CREDENTIALS_KEY', Buffer.alloc(32, 9).toString('hex'));
    const integration = app.get(TikTokIntegrationService);
    const client = app.get(TikTokClient);
    const tokens = {
      access_token: 'fixture-access',
      refresh_token: 'fixture-refresh',
      open_id: 'fixture-account',
      scope: 'user.info.basic',
      expires_in: 3600,
      refresh_expires_in: 86400,
    };
    const exchange = jest.spyOn(client, 'exchange').mockResolvedValue(tokens);
    const refresh = jest.spyOn(client, 'refresh').mockResolvedValue({
      ...tokens,
      access_token: 'fixture-new-access',
      refresh_token: 'fixture-new-refresh',
    });
    const verify = jest
      .spyOn(client, 'verifyAccount')
      .mockRejectedValue(new Error('Fixture verification unavailable'));
    try {
      const authorization = await integration.begin(users[0]);
      const callback = `/api/v1/integrations/tiktok-live/oauth/callback?state=${authorization.state}&code=fixture-code`;
      expect(
        (await app.inject({ method: 'GET', url: callback })).statusCode,
      ).toBe(401);
      expect(exchange).not.toHaveBeenCalled();
      await integration.callback({
        state: authorization.state,
        code: 'fixture-code',
      });
      await expect(
        integration.callback({
          state: authorization.state,
          code: 'fixture-code',
        }),
      ).rejects.toThrow();
      expect(exchange).toHaveBeenCalledTimes(1);
      await prisma.liveIntegration.update({
        where: { tenantId: tenantIds[0] },
        data: { accessExpiresAt: new Date(Date.now() - 1) },
      });
      await expect(integration.verify(users[0])).rejects.toThrow();
      const row = await prisma.liveIntegration.findUniqueOrThrow({
        where: { tenantId: tenantIds[0] },
      });
      expect(row.healthStatus).toBe('DEGRADED');
      const stored = JSON.parse(
        decryptSecret(Buffer.alloc(32, 9), row.credentialsEncrypted!),
      ) as { refresh_token: string };
      expect(stored.refresh_token).toBe('fixture-new-refresh');
      const view = await integration.view(tenantIds[0]);
      expect(view).not.toHaveProperty('credentialsEncrypted');
      expect(view.capabilities.inboundComments).toBe('unsupported');
      const failedState = await integration.begin(users[0]);
      exchange.mockRejectedValueOnce(new Error('Fixture exchange failure'));
      await expect(
        integration.callback({
          state: failedState.state,
          code: 'fixture-bad-code',
        }),
      ).rejects.toThrow();
      expect(
        (
          await prisma.liveIntegration.findUniqueOrThrow({
            where: { tenantId: tenantIds[0] },
          })
        ).oauthStateHash,
      ).toBeNull();
    } finally {
      exchange.mockRestore();
      refresh.mockRestore();
      verify.mockRestore();
    }
  });
  it('refreshes commercial truth on human approval and blocks automatic messages through the inbox', async () => {
    await app.get(TikTokIntegrationService).settings(users[0], {
      responseMode: 'HUMAN_APPROVAL',
      reservationSeconds: 300,
      maxReservationsPerSession: 500,
    });
    const s = await session();
    const message = await live.message(tenantIds[0], s.id, {
      customerAlias: 'approval-fixture',
      text: 'precio?',
      eventId: randomUUID(),
    });
    const reservation = await live.reserve(tenantIds[0], s.id, {
      customerAlias: 'other-fixture',
      offerId: s.offerId,
      quantity: 1,
      idempotencyKey: randomUUID(),
    });
    await live.approve(tenantIds[0], message.eventId);
    const event = await prisma.liveEvent.findUniqueOrThrow({
      where: { id: message.eventId },
    });
    expect(event.suggestedReply).toContain('ya no tiene unidades');
    const flags = await app.inject({
      method: 'PATCH',
      url: `/api/v1/conversations/${event.conversationId}`,
      headers: { authorization: `Bearer ${token(users[0])}` },
      payload: { agentEnabled: true },
    });
    expect(flags.statusCode).toBe(400);
    await live.cancel(tenantIds[0], reservation.id);
  });
  it('authenticates and deduplicates official deauthorization webhooks', async () => {
    config.set('TIKTOK_CLIENT_KEY', 'fixture-client');
    config.set('TIKTOK_CLIENT_SECRET', 'fixture-client-secret');
    await prisma.liveIntegration.update({
      where: { tenantId: tenantIds[0] },
      data: { accountId: 'fixture-tiktok-account', healthStatus: 'CONNECTED' },
    });
    const oldBody = JSON.stringify({
      event: 'authorization.removed',
      client_key: 'fixture-client',
      user_openid: 'fixture-tiktok-account',
      create_time: Math.floor(Date.now() / 1000) - 3600,
    });
    const signedAt = Math.floor(Date.now() / 1000);
    const oldSignature = `t=${signedAt},s=${createHmac('sha256', 'fixture-client-secret').update(`${signedAt}.${oldBody}`).digest('hex')}`;
    for (let i = 0; i < 2; i++) {
      const oldResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/tiktok',
        payload: oldBody,
        headers: {
          'content-type': 'application/json',
          'tiktok-signature': oldSignature,
        },
      });
      expect(oldResponse.statusCode).toBe(200);
    }
    expect(
      (
        await prisma.liveIntegration.findUniqueOrThrow({
          where: { tenantId: tenantIds[0] },
        })
      ).healthStatus,
    ).toBe('CONNECTED');
    const body = JSON.stringify({
      event: 'authorization.removed',
      client_key: 'fixture-client',
      user_openid: 'fixture-tiktok-account',
      create_time: Math.floor(Date.now() / 1000),
    });
    const time = Math.floor(Date.now() / 1000);
    const signature = `t=${time},s=${createHmac('sha256', 'fixture-client-secret').update(`${time}.${body}`).digest('hex')}`;
    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/tiktok',
      payload: body,
      headers: {
        'content-type': 'application/json',
        'tiktok-signature': 'invalid',
      },
    });
    expect(bad.statusCode).toBe(401);
    for (let i = 0; i < 2; i++) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/tiktok',
        payload: body,
        headers: {
          'content-type': 'application/json',
          'tiktok-signature': signature,
        },
      });
      expect(response.statusCode).toBe(200);
    }
    expect(
      await prisma.webhookEvent.count({
        where: { tenantId: tenantIds[0], providerId: 'tiktok' },
      }),
    ).toBe(2);
    expect(
      (
        await prisma.liveIntegration.findUniqueOrThrow({
          where: { tenantId: tenantIds[0] },
        })
      ).healthStatus,
    ).toBe('DISCONNECTED');
    await prisma.webhookEvent.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
  });
});
