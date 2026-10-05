import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiveCampaign, LiveReservation, Prisma } from '@prisma/client';
import { createHmac } from 'node:crypto';
import {
  distinctUntilChanged,
  exhaustMap,
  interval,
  map,
  merge,
  Observable,
  of,
} from 'rxjs';
import { SalesAgentRuntimeService } from '../agent-runtime/sales-agent-runtime.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { assertManager } from '../common/roles';
import { AuthUserPayload } from '../common/types/auth-user';
import { activeCustomDomain } from '../integrations/integration-state';
import { reserveStock, withAllocations } from '../orders/stock';
import { PrismaService } from '../prisma/prisma.service';
import {
  customDomainUrl,
  DEFAULT_STOREFRONT_URL_TEMPLATE,
  storefrontUrl,
} from '../storefront/storefront-host';
import {
  CurrentLiveProductDto,
  LiveCampaignDto,
  LiveMessageDto,
  ReserveLiveDto,
} from './dto/live.dto';
import { detectLiveIntent } from './live-intent';
import {
  liveBusinessEvent,
  liveReservationToken,
  lockLiveReservation,
  releasePendingLiveReservation,
} from './live-reservations';
import { LIVE_INTEGRATION_ACCESS } from './live-adapter';
import type { LiveIntegrationAccess } from './live-adapter';
import { StorefrontPublicService } from '../storefront/storefront-public.service';

const OFFER_INCLUDE = {
  product: {
    include: { variants: true, components: { include: { component: true } } },
  },
  variant: true,
} satisfies Prisma.LiveOfferInclude;
type Offer = Prisma.LiveOfferGetPayload<{ include: typeof OFFER_INCLUDE }>;
const money = (cents: number) => `S/${(cents / 100).toFixed(2)}`;

@Injectable()
export class LiveService {
  private readonly logger = new Logger(LiveService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(LIVE_INTEGRATION_ACCESS)
    private readonly integration: LiveIntegrationAccess,
    private readonly runtime: SalesAgentRuntimeService,
    private readonly limits: PlanLimitsService,
    private readonly storefront: StorefrontPublicService,
  ) {}

  async campaigns(tenantId: string) {
    await this.integration.requireActive(tenantId);
    const campaigns = await this.prisma.liveCampaign.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        offers: { include: OFFER_INCLUDE, orderBy: { sortOrder: 'asc' } },
        sessions: { orderBy: { startedAt: 'desc' }, take: 1 },
      },
    });
    return campaigns.map(({ offers, ...campaign }) => ({
      ...campaign,
      products: offers.map((offer) => this.offerView(offer)),
    }));
  }
  async saveCampaign(user: AuthUserPayload, dto: LiveCampaignDto, id?: string) {
    assertManager(
      user,
      'Solo el dueño o un administrador puede configurar campañas LIVE.',
    );
    await this.integration.requireActive(user.tenantId);
    const tenantId = user.tenantId;
    if (
      dto.startsAt &&
      dto.endsAt &&
      new Date(dto.endsAt) <= new Date(dto.startsAt)
    )
      throw new BadRequestException(
        'El fin de la campaña debe ser posterior al inicio.',
      );
    if (
      dto.salesAgentId &&
      !(await this.prisma.salesAgent.findFirst({
        where: { id: dto.salesAgentId, tenantId, isActive: true },
      }))
    )
      throw new BadRequestException('Elige un vendedor activo de tu negocio.');
    const products = await this.prisma.product.findMany({
      where: { tenantId, id: { in: dto.products.map((p) => p.productId) } },
      include: { variants: true, components: { include: { component: true } } },
    });
    const unique = new Set<string>();
    for (const input of dto.products) {
      const product = products.find((p) => p.id === input.productId);
      const variant = product?.variants.find((v) => v.id === input.variantId);
      if (
        !product ||
        !product.isAvailable ||
        !product.isPublishedOnStore ||
        product.kind !== 'PRODUCT' ||
        product.currency !== 'PEN' ||
        (product.variants.length
          ? !variant?.isAvailable
          : Boolean(input.variantId))
      )
        throw new BadRequestException(
          'Elige productos físicos publicados, disponibles y en soles, con su variante correspondiente.',
        );
      const key = `${product.id}:${input.variantId ?? ''}`;
      if (unique.has(key))
        throw new BadRequestException(
          'Un producto o variante solo puede aparecer una vez en la campaña.',
        );
      unique.add(key);
      if (
        input.livePriceCents > (variant?.priceCents ?? product.basePriceCents)
      )
        throw new BadRequestException(
          'El precio LIVE no puede superar el precio del catálogo.',
        );
      if (
        input.allocatedStock >
        this.catalogStock({ product, variant: variant ?? null })
      )
        throw new BadRequestException(
          `El stock asignado de «${product.name}» supera su disponibilidad actual.`,
        );
    }
    return this.prisma.$transaction(async (tx) => {
      if (id) {
        await tx.$queryRaw`SELECT "id" FROM "LiveCampaign" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
        const row = await tx.liveCampaign.findFirst({
          where: { id, tenantId },
        });
        if (!row) throw new NotFoundException('Esta campaña no existe.');
        if (row.status !== 'DRAFT')
          throw new ConflictException(
            'Las campañas iniciadas conservan sus ofertas. Crea otra campaña para cambiar las condiciones.',
          );
        await tx.liveOffer.deleteMany({ where: { tenantId, campaignId: id } });
      }
      const data = {
        name: dto.name.trim(),
        mode: dto.mode,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        salesAgentId: dto.salesAgentId ?? null,
        reservationSeconds: dto.reservationSeconds,
      };
      const campaign = id
        ? await tx.liveCampaign.update({
            where: { tenantId_id: { tenantId, id } },
            data,
          })
        : await tx.liveCampaign.create({ data: { tenantId, ...data } });
      await tx.liveOffer.createMany({
        data: dto.products.map((p, index) => ({
          ...p,
          variantId: p.variantId || null,
          sortOrder: p.sortOrder ?? index,
          tenantId,
          campaignId: campaign.id,
        })),
      });
      return { id: campaign.id };
    });
  }
  async start(user: AuthUserPayload, campaignId: string) {
    await this.integration.requireActive(user.tenantId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "LiveCampaign" WHERE "id" = ${campaignId} AND "tenantId" = ${user.tenantId} FOR UPDATE`;
      const campaign = await tx.liveCampaign.findFirst({
        where: { id: campaignId, tenantId: user.tenantId },
        include: {
          offers: { where: { enabled: true }, orderBy: { sortOrder: 'asc' } },
        },
      });
      if (!campaign) throw new NotFoundException('Esta campaña no existe.');
      const active = await tx.liveSession.findFirst({
        where: { tenantId: user.tenantId, campaignId, status: 'ACTIVE' },
      });
      if (active) return { id: active.id };
      if (
        campaign.status !== 'DRAFT' ||
        !campaign.offers.length ||
        (campaign.endsAt && campaign.endsAt <= new Date()) ||
        (campaign.startsAt && campaign.startsAt > new Date())
      )
        throw new ConflictException(
          'Esta campaña no puede iniciarse ahora. Revisa las fechas y sus productos.',
        );
      await tx.liveCampaign.update({
        where: { tenantId_id: { tenantId: user.tenantId, id: campaignId } },
        data: { status: 'ACTIVE' },
      });
      const session = await tx.liveSession.create({
        data: {
          tenantId: user.tenantId,
          campaignId,
          currentOfferId: campaign.offers[0].id,
        },
      });
      await tx.liveEvent.create({
        data: {
          tenantId: user.tenantId,
          sessionId: session.id,
          kind: 'live_started',
          externalEventId: `start:${session.id}`,
        },
      });
      this.logger.log(
        JSON.stringify({
          event: 'live_started',
          tenantId: user.tenantId,
          campaignId,
          liveSessionId: session.id,
        }),
      );
      return { id: session.id };
    });
  }
  async current(
    tenantId: string,
    sessionId: string,
    dto: CurrentLiveProductDto,
  ) {
    await this.integration.requireActive(tenantId);
    await this.prisma.$transaction(async (tx) => {
      const session = await this.lockSession(tx, tenantId, sessionId);
      if (
        !(await tx.liveOffer.findFirst({
          where: {
            id: dto.offerId,
            tenantId,
            campaignId: session.campaignId,
            enabled: true,
          },
        }))
      )
        throw new NotFoundException('El producto no pertenece a esta campaña.');
      await tx.liveSession.update({
        where: { tenantId_id: { tenantId, id: sessionId } },
        data: { currentOfferId: dto.offerId },
      });
      await tx.liveEvent.create({
        data: {
          tenantId,
          sessionId,
          kind: 'live_current_product',
          externalEventId: `current:${sessionId}:${Date.now()}:${dto.offerId}`,
        },
      });
    });
    return this.panel(tenantId, sessionId);
  }
  async end(tenantId: string, sessionId: string) {
    await this.integration.requireActive(tenantId);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "LiveSession" WHERE "id" = ${sessionId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const session = await tx.liveSession.findFirst({
        where: { id: sessionId, tenantId },
      });
      if (!session) throw new NotFoundException('Esta sesión no existe.');
      if (session.status !== 'ACTIVE') return;
      await tx.liveSession.update({
        where: { tenantId_id: { tenantId, id: sessionId } },
        data: { status: 'ENDED', endedAt: new Date() },
      });
      await tx.liveCampaign.update({
        where: { tenantId_id: { tenantId, id: session.campaignId } },
        data: { status: 'ENDED' },
      });
      await tx.liveEvent.create({
        data: {
          tenantId,
          sessionId,
          kind: 'live_ended',
          externalEventId: `end:${sessionId}`,
        },
      });
      // Issued checkout links remain valid until their original expiry; no new reservations.
    });
    return this.panel(tenantId, sessionId);
  }
  async panel(tenantId: string, sessionId: string) {
    await this.integration.requireActive(tenantId);
    const session = await this.prisma.liveSession.findFirst({
      where: { tenantId, id: sessionId },
      include: {
        campaign: {
          include: {
            offers: { include: OFFER_INCLUDE, orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('Esta sesión no existe.');
    const [events, reservations, counts] = await Promise.all([
      this.prisma.liveEvent.findMany({
        where: { tenantId, sessionId, kind: 'live_message_received' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.liveReservation.findMany({
        where: { tenantId, sessionId },
        include: {
          order: {
            select: {
              id: true,
              status: true,
              totalCents: true,
              paymentState: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.liveEvent.groupBy({
        by: ['kind'],
        where: { tenantId, sessionId },
        _count: true,
      }),
    ]);
    const aggregate = await this.prisma.liveReservation.groupBy({
      by: ['offerId', 'status'],
      where: { tenantId, sessionId },
      _count: true,
      _sum: { quantity: true },
    });
    const revenue = await this.prisma.order.aggregate({
      where: {
        tenantId,
        liveReservation: { sessionId },
        status: { in: ['PAID', 'FULFILLING', 'SHIPPED', 'COMPLETED'] },
      },
      _sum: { totalCents: true },
      _count: true,
    });
    const byKind = (kind: string) =>
      counts.find((c) => c.kind === kind)?._count ?? 0;
    const messages = await this.prisma.message.findMany({
      where: {
        conversation: { tenantId },
        id: {
          in: events
            .map((e) => e.externalEventId)
            .filter((id) => id.startsWith('message:'))
            .map((id) => id.slice(8)),
        },
      },
      select: { id: true, body: true },
    });
    const products = session.campaign.offers.map((offer) => ({
      ...this.offerView(offer, session.startedAt, session.campaign.endsAt),
      unitsSold: aggregate
        .filter((r) => r.offerId === offer.id && r.status === 'CONVERTED')
        .reduce((sum, r) => sum + (r._sum.quantity ?? 0), 0),
    }));
    return {
      id: session.id,
      campaignId: session.campaignId,
      name: session.campaign.name,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      currentOfferId: session.currentOfferId,
      products,
      // Message bodies are returned only through this tenant-scoped panel, never logged or sent by SSE.
      messages: events.map((e) => ({
        id: e.id,
        conversationId: e.conversationId,
        intent: e.intent,
        suggestedReply: e.suggestedReply,
        approvedAt: e.approvedAt,
        createdAt: e.createdAt,
        text:
          messages.find((m) => `message:${m.id}` === e.externalEventId)?.body ??
          '',
        reservationId: e.reservationId,
      })),
      reservations: await Promise.all(
        reservations.map(async (r) => ({
          id: r.id,
          offerId: r.offerId,
          quantity: r.quantity,
          unitCents: r.unitCents,
          status: r.status,
          expiresAt: r.expiresAt,
          orderId: r.orderId,
          checkoutUrl:
            r.status === 'PENDING' && r.expiresAt > new Date()
              ? await this.checkoutUrl(r)
              : null,
        })),
      ),
      analytics: {
        messages: byKind('live_message_received'),
        buyIntents: byKind('live_buy_intent'),
        reservations: byKind('live_reservation_created'),
        expired: byKind('live_reservation_expired'),
        checkouts: byKind('live_checkout_created'),
        sales: revenue._count,
        revenueCents: revenue._sum.totalCents ?? 0,
        conversionRate: byKind('live_buy_intent')
          ? revenue._count / byKind('live_buy_intent')
          : 0,
        unitsSold: products.reduce((sum, p) => sum + p.unitsSold, 0),
        soldOut: products.filter((p) => p.availableStock === 0).length,
        revenueByProduct: Object.fromEntries(
          products.map((p) => [p.id, p.unitsSold * p.livePriceCents]),
        ),
      },
    };
  }
  async reserve(tenantId: string, sessionId: string, dto: ReserveLiveDto) {
    const settings = await this.integration.requireActive(tenantId);
    const published = await this.prisma.storefront.findUnique({
      where: { tenantId },
      select: { status: true },
    });
    if (
      published?.status !== 'PUBLISHED' ||
      (await this.storefront.checkout(tenantId)).mode !== 'online'
    )
      throw new ConflictException(
        'Publica tu tienda y habilita sus cobros en línea antes de reservar para LIVE.',
      );
    const reservation = await this.prisma.$transaction(
      async (tx) => {
        const session = await this.lockSession(tx, tenantId, sessionId);
        const customerKey = this.customerKey(tenantId, dto.customerAlias);
        const conversationId = await this.conversation(
          tx,
          tenantId,
          sessionId,
          customerKey,
          settings.channelId,
        );
        return this.reserveInTransaction(
          tx,
          tenantId,
          sessionId,
          session.campaign,
          conversationId,
          customerKey,
          dto,
          settings.maxReservationsPerSession,
        );
      },
      { timeout: 15000 },
    );
    return {
      id: reservation.id,
      status: reservation.status,
      expiresAt: reservation.expiresAt,
      checkoutUrl: await this.checkoutUrl(reservation),
    };
  }
  async cancel(tenantId: string, reservationId: string) {
    await this.integration.requireActive(tenantId);
    await this.prisma.$transaction(async (tx) => {
      const reservation = await lockLiveReservation(
        tx,
        tenantId,
        reservationId,
      );
      if (reservation.orderId)
        throw new ConflictException(
          'La reserva ya tiene un pedido. Cancélalo desde Pedidos.',
        );
      await releasePendingLiveReservation(tx, reservation, 'CANCELLED');
    });
    return { cancelled: true };
  }
  async message(tenantId: string, sessionId: string, dto: LiveMessageDto) {
    const settings = await this.integration.requireActive(tenantId);
    const detection = detectLiveIntent(dto.text);
    const customerKey = this.customerKey(tenantId, dto.customerAlias);
    const result = await this.prisma.$transaction(async (tx) => {
      const session = await this.lockSession(tx, tenantId, sessionId);
      const externalEventId = `manual:${sessionId}:${dto.eventId}`;
      const existing = await tx.liveEvent.findFirst({
        where: { tenantId, externalEventId, kind: 'live_manual_dedup' },
      });
      if (existing) return { eventId: existing.id, duplicate: true };
      const conversationId = await this.conversation(
        tx,
        tenantId,
        sessionId,
        customerKey,
        settings.channelId,
      );
      const message = await tx.message.create({
        data: {
          conversationId,
          direction: 'INBOUND',
          authorType: 'BUYER',
          body: dto.text,
          metadata: {
            source: 'manual_live',
            sessionId,
            currentOfferId: session.currentOfferId,
            intent: detection.intent,
          },
        },
      });
      const offer = session.currentOfferId
        ? await tx.liveOffer.findFirst({
            where: {
              id: session.currentOfferId,
              tenantId,
              campaignId: session.campaignId,
            },
            include: OFFER_INCLUDE,
          })
        : null;
      let reply =
        'Selecciona el producto que estás presentando para contextualizar este mensaje.';
      if (offer) {
        const view = this.offerView(
          offer,
          session.startedAt,
          session.campaign.endsAt,
        );
        reply =
          detection.intent === 'PRICE'
            ? `${view.name}: precio LIVE ${money(view.livePriceCents)}. ${view.availableStock} disponibles.`
            : detection.intent === 'STOCK'
              ? `Quedan ${view.availableStock} unidades de ${view.name}.`
              : detection.intent === 'SHIPPING'
                ? 'El checkout calcula el envío con tu distrito y muestra las opciones de entrega disponibles.'
                : detection.intent === 'PAYMENT'
                  ? 'Al completar tus datos en el checkout verás las formas de pago habilitadas por la tienda.'
                  : detection.intent === 'PRODUCT_INFO'
                    ? `${view.name}. ${offer.product.descriptionShort ?? 'Consulta al negocio para confirmar los detalles que necesitas.'}`
                    : ['BUY', 'BUY_QUANTITY'].includes(detection.intent)
                      ? `Solicitud de ${detection.quantity} unidades de ${view.name}. Revisa el stock y confirma la reserva.`
                      : detection.intent === 'CANCEL'
                        ? 'Revisa las reservas de esta conversación para cancelar la compra.'
                        : '¿Qué información necesitas del producto que estamos presentando?';
        if (['BUY', 'BUY_QUANTITY'].includes(detection.intent))
          await tx.liveEvent.create({
            data: {
              tenantId,
              sessionId,
              kind: 'live_buy_intent',
              externalEventId: `buy:${message.id}`,
              conversationId,
              intent: detection.intent,
            },
          });
      }
      const event = await tx.liveEvent.create({
        data: {
          tenantId,
          sessionId,
          kind: 'live_message_received',
          externalEventId: `message:${message.id}`,
          conversationId,
          intent: detection.intent,
          suggestedReply: settings.responseMode === 'HUMAN_ONLY' ? null : reply,
        },
      });
      await tx.liveEvent.create({
        data: {
          tenantId,
          sessionId,
          kind: 'live_manual_dedup',
          externalEventId,
          conversationId,
        },
      });
      return {
        eventId: event.id,
        duplicate: false,
        conversationId,
        campaign: session.campaign,
        offerId: offer?.id,
      };
    });
    if (
      !result.duplicate &&
      detection.intent === 'UNKNOWN' &&
      settings.responseMode !== 'HUMAN_ONLY' &&
      result.conversationId
    ) {
      const history = await this.prisma.message.findMany({
        where: {
          conversationId: result.conversationId,
          conversation: { tenantId },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      const suggestion = await this.runtime.suggestLiveQuestion({
        tenantId,
        agentId: result.campaign?.salesAgentId,
        inboundText: dto.text,
        history: history.reverse().map((m) => ({
          role: m.direction === 'INBOUND' ? 'buyer' : 'agent',
          text: m.body,
        })),
        allowAi: await this.limits.canUseAi(tenantId),
      });
      if (suggestion.usedAi) await this.limits.recordAiReply(tenantId);
      await this.prisma.liveEvent.updateMany({
        where: { id: result.eventId, tenantId },
        data: { suggestedReply: suggestion.text },
      });
    }
    return { eventId: result.eventId, duplicate: result.duplicate };
  }
  async approve(tenantId: string, eventId: string) {
    await this.integration.requireActive(tenantId);
    // Approval means reviewed for manual copy, never delivery to TikTok.
    await this.prisma.$transaction(async (tx) => {
      const event = await tx.liveEvent.findFirst({
        where: { id: eventId, tenantId, kind: 'live_message_received' },
      });
      if (!event?.suggestedReply || !event.conversationId)
        throw new NotFoundException('Esta sugerencia no existe.');
      let suggestedReply = event.suggestedReply;
      if (event.intent === 'PRICE' || event.intent === 'STOCK') {
        const inboundId = event.externalEventId.slice('message:'.length);
        const inbound = await tx.message.findFirst({
          where: { id: inboundId, conversation: { tenantId } },
          select: { metadata: true },
        });
        const metadata = inbound?.metadata as {
          currentOfferId?: string;
        } | null;
        const session = await tx.liveSession.findFirst({
          where: { id: event.sessionId, tenantId },
          include: { campaign: true },
        });
        const offer = metadata?.currentOfferId
          ? await tx.liveOffer.findFirst({
              where: {
                id: metadata.currentOfferId,
                tenantId,
                campaignId: session?.campaignId,
              },
              include: OFFER_INCLUDE,
            })
          : null;
        if (!offer || !session)
          throw new ConflictException(
            'El producto de esta sugerencia ya no está disponible. Registra una nueva consulta.',
          );
        const view = this.offerView(
          offer,
          session.startedAt,
          session.campaign.endsAt,
        );
        suggestedReply =
          view.availableStock === 0
            ? `${view.name}: esta oferta LIVE ya no tiene unidades disponibles.`
            : event.intent === 'PRICE'
              ? `${view.name}: precio LIVE ${money(view.livePriceCents)}. ${view.availableStock} disponibles.`
              : `Quedan ${view.availableStock} unidades de ${view.name}.`;
      }
      const changed = await tx.liveEvent.updateMany({
        where: { id: eventId, tenantId, approvedAt: null },
        data: { approvedAt: new Date(), suggestedReply },
      });
      if (!changed.count) return;
      await tx.conversation.updateMany({
        where: { id: event.conversationId, tenantId },
        data: { agentEnabled: false, status: 'PAUSED' },
      });
      await tx.message.create({
        data: {
          conversationId: event.conversationId,
          direction: 'OUTBOUND',
          authorType: 'HUMAN_OPERATOR',
          body: suggestedReply,
          metadata: { source: 'manual_live_suggestion', delivered: false },
        },
      });
    });
    return { approved: true, delivered: false };
  }
  async stream(
    tenantId: string,
    sessionId: string,
  ): Promise<Observable<MessageEvent>> {
    await this.panel(tenantId, sessionId);
    // Same authenticated SSE transport as inbox, backed by durable events for checkout/payments.
    const updates = interval(2000).pipe(
      exhaustMap(async () => {
        await this.integration.requireActive(tenantId);
        const latest = await this.prisma.liveEvent.findFirst({
          where: { tenantId, sessionId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true },
        });
        const held = await this.prisma.liveReservation.count({
          where: {
            tenantId,
            sessionId,
            status: 'PENDING',
            expiresAt: { gt: new Date() },
          },
        });
        const session = await this.prisma.liveSession.findFirstOrThrow({
          where: { id: sessionId, tenantId },
          include: {
            campaign: {
              include: {
                offers: { include: OFFER_INCLUDE, orderBy: { id: 'asc' } },
              },
            },
          },
        });
        const stock = session.campaign.offers.map((offer) =>
          this.offerView(offer, session.startedAt, session.campaign.endsAt),
        );
        return `${latest?.id ?? ''}:${held}:${JSON.stringify(stock)}`;
      }),
      distinctUntilChanged(),
      map((): MessageEvent => ({ type: 'live', data: { sessionId } })),
    );
    return merge(
      of<MessageEvent>({ type: 'live', data: { sessionId } }),
      updates,
      interval(25000).pipe(
        map((): MessageEvent => ({ type: 'ping', data: {} })),
      ),
    );
  }
  private async lockSession(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ) {
    await tx.$queryRaw`SELECT "id" FROM "LiveSession" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
    const session = await tx.liveSession.findFirst({
      where: { id, tenantId },
      include: { campaign: true },
    });
    if (!session) throw new NotFoundException('Esta sesión no existe.');
    if (
      session.status !== 'ACTIVE' ||
      (session.campaign.endsAt && session.campaign.endsAt <= new Date())
    )
      throw new ConflictException('Esta sesión LIVE terminó.');
    return session;
  }
  private async conversation(
    tx: Prisma.TransactionClient,
    tenantId: string,
    sessionId: string,
    key: string,
    channelId: string | null,
  ) {
    let channel = channelId
      ? await tx.channel.findFirst({
          where: { id: channelId, tenantId, type: 'TIKTOK_LIVE' },
        })
      : null;
    if (!channel) {
      channel = await tx.channel.upsert({
        where: {
          tenantId_type_externalId: {
            tenantId,
            type: 'TIKTOK_LIVE',
            externalId: 'manual-live',
          },
        },
        create: {
          tenantId,
          type: 'TIKTOK_LIVE',
          externalId: 'manual-live',
          displayName: 'TikTok LIVE · gestión manual',
          healthStatus: 'PENDING',
        },
        update: {},
      });
      await tx.liveIntegration.updateMany({
        where: { tenantId },
        data: { channelId: channel.id },
      });
    }
    const externalThreadId = `live:${sessionId}:${key}`;
    const existing = await tx.conversation.findFirst({
      where: { tenantId, channelId: channel.id, externalThreadId },
    });
    if (existing) return existing.id;
    await this.limits.assertCanStartConversation(tenantId);
    const row = await tx.conversation.create({
      data: {
        tenantId,
        channelId: channel.id,
        externalThreadId,
        agentEnabled: false,
        status: 'PAUSED',
        lastInboundAt: new Date(),
      },
    });
    return row.id;
  }
  private async reserveInTransaction(
    tx: Prisma.TransactionClient,
    tenantId: string,
    sessionId: string,
    campaign: LiveCampaign,
    conversationId: string,
    customerKey: string,
    dto: ReserveLiveDto,
    maxReservations: number,
  ): Promise<LiveReservation> {
    const replay = await tx.liveReservation.findFirst({
      where: { tenantId, idempotencyKey: dto.idempotencyKey },
    });
    if (replay) {
      if (
        replay.sessionId !== sessionId ||
        replay.offerId !== dto.offerId ||
        replay.customerKey !== customerKey ||
        replay.quantity !== dto.quantity
      )
        throw new ConflictException(
          'La solicitud de reserva ya fue utilizada con otros datos.',
        );
      if (replay.status !== 'PENDING' || replay.expiresAt <= new Date())
        throw new ConflictException(
          'Esta reserva ya venció, fue cancelada o tiene un pedido. Revisa el panel antes de crear otra.',
        );
      return replay;
    }
    const session = await tx.liveSession.findFirstOrThrow({
      where: { tenantId, id: sessionId },
    });
    const offer = await tx.liveOffer.findFirst({
      where: {
        tenantId,
        id: dto.offerId,
        campaignId: campaign.id,
        enabled: true,
      },
      include: OFFER_INCLUDE,
    });
    if (!offer)
      throw new NotFoundException('Esta oferta no existe en la campaña.');
    const endsAt = Math.min(
      session.startedAt.getTime() + offer.durationSeconds * 1000,
      campaign.endsAt?.getTime() ?? Infinity,
    );
    if (
      endsAt <= Date.now() ||
      !offer.product.isAvailable ||
      !offer.product.isPublishedOnStore ||
      offer.product.currency !== 'PEN' ||
      (offer.variantId && !offer.variant?.isAvailable)
    )
      throw new ConflictException('Esta oferta LIVE ya no está disponible.');
    const used = await tx.liveReservation.aggregate({
      where: {
        tenantId,
        sessionId,
        offerId: offer.id,
        customerKey,
        status: { in: ['PENDING', 'CHECKED_OUT', 'CONVERTED'] },
      },
      _sum: { quantity: true },
    });
    if ((used._sum.quantity ?? 0) + dto.quantity > offer.maxPerCustomer)
      throw new ConflictException(
        'Esta compra supera el máximo por comprador de la oferta.',
      );
    if (
      (await tx.liveReservation.count({ where: { tenantId, sessionId } })) >=
      maxReservations
    )
      throw new ConflictException('Esta sesión alcanzó su límite de reservas.');
    const claimed = await tx.liveOffer.updateMany({
      where: {
        tenantId,
        id: offer.id,
        claimedQty: { lte: offer.allocatedStock - dto.quantity },
      },
      data: { claimedQty: { increment: dto.quantity } },
    });
    if (!claimed.count)
      throw new ConflictException(
        'No quedan suficientes unidades en esta oferta LIVE.',
      );
    const line = {
      productId: offer.productId,
      variantId: offer.variantId,
      handle: offer.product.handle,
      title: offer.product.name,
      quantity: dto.quantity,
      unitCents: offer.livePriceCents,
      totalCents: offer.livePriceCents * dto.quantity,
    };
    const [stocked] = await withAllocations(tx, [line]);
    await reserveStock(tx, [stocked]);
    const reservation = await tx.liveReservation.create({
      data: {
        tenantId,
        sessionId,
        offerId: offer.id,
        conversationId,
        customerKey,
        idempotencyKey: dto.idempotencyKey,
        quantity: dto.quantity,
        unitCents: offer.livePriceCents,
        line: stocked,
        expiresAt: new Date(
          Math.min(Date.now() + campaign.reservationSeconds * 1000, endsAt),
        ),
      },
    });
    await liveBusinessEvent(tx, reservation, 'live_reservation_created');
    if (offer.claimedQty + dto.quantity === offer.allocatedStock)
      await liveBusinessEvent(tx, reservation, 'live_product_sold_out');
    await tx.message.create({
      data: {
        conversationId,
        direction: 'OUTBOUND',
        authorType: 'SYSTEM',
        body: `Reserva confirmada: ${dto.quantity} × ${offer.product.name} a ${money(offer.livePriceCents)} por unidad.`,
        metadata: {
          reservationId: reservation.id,
          source: 'live_business_truth',
          delivered: false,
        },
      },
    });
    return reservation;
  }
  private customerKey(tenantId: string, alias: string): string {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    )
      .update(
        `live-customer:${tenantId}:${alias.trim().toLocaleLowerCase('es')}`,
      )
      .digest('hex');
  }
  private catalogStock({
    product,
    variant,
  }: Pick<Offer, 'product' | 'variant'>): number {
    if (product.components.length)
      return Math.min(
        ...product.components.map((c) =>
          !c.component.isAvailable
            ? 0
            : c.component.stockUnlimited
              ? Number.MAX_SAFE_INTEGER
              : Math.floor((c.component.stockQty ?? 0) / c.quantity),
        ),
      );
    if (product.stockUnlimited) return Number.MAX_SAFE_INTEGER;
    return Math.max(0, variant?.stockQty ?? product.stockQty ?? 0);
  }
  private offerView(offer: Offer, startedAt?: Date, campaignEnd?: Date | null) {
    const expiresAt = startedAt
      ? new Date(
          Math.min(
            startedAt.getTime() + offer.durationSeconds * 1000,
            campaignEnd?.getTime() ?? Infinity,
          ),
        )
      : null;
    const available =
      offer.enabled &&
      offer.product.isAvailable &&
      offer.product.isPublishedOnStore &&
      (!offer.variantId || offer.variant?.isAvailable) &&
      (!expiresAt || expiresAt > new Date());
    return {
      id: offer.id,
      productId: offer.productId,
      variantId: offer.variantId,
      name: offer.product.name,
      regularPriceCents:
        offer.variant?.priceCents ?? offer.product.basePriceCents,
      livePriceCents: offer.livePriceCents,
      allocatedStock: offer.allocatedStock,
      maxPerCustomer: offer.maxPerCustomer,
      durationSeconds: offer.durationSeconds,
      enabled: offer.enabled,
      expiresAt,
      availableStock: available
        ? Math.max(
            0,
            Math.min(
              offer.allocatedStock - offer.claimedQty,
              this.catalogStock(offer),
            ),
          )
        : 0,
    };
  }
  private async checkoutUrl(reservation: LiveReservation): Promise<string> {
    const [tenant, domain] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: reservation.tenantId },
        select: { slug: true },
      }),
      activeCustomDomain(this.prisma, reservation.tenantId),
    ]);
    const template = this.config.get<string>(
      'STOREFRONT_URL_TEMPLATE',
      DEFAULT_STOREFRONT_URL_TEMPLATE,
    );
    const base = domain
      ? customDomainUrl(template, domain)
      : storefrontUrl(template, tenant.slug);
    const url = new URL('/live-checkout', base);
    url.searchParams.set(
      'live',
      liveReservationToken(
        this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        reservation,
      ),
    );
    return url.toString();
  }
}
