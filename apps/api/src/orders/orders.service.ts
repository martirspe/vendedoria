import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderChannel, OrderStatus, Prisma } from '@prisma/client';
import { CheckoutService } from '../checkout/checkout.service';
import { OrderEmailService } from '../checkout/order-email.service';
import { InboxEventsService } from '../conversations/inbox-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { OrderNotificationsService } from './order-notifications.service';
import { releaseOrder, settlePaidOrder } from './settlement';
import {
  CreateOrderDto,
  CreatePaymentLinkDto,
  ReconcileOrderDto,
  UpdateOrderStatusDto,
} from './dto/orders.dto';

const ORDER_INCLUDE = {
  items: true,
  payments: {
    orderBy: { createdAt: 'desc' as const },
  },
  conversation: {
    select: {
      id: true,
      contactName: true,
      contactPhone: true,
      channel: { select: { type: true, displayName: true } },
    },
  },
} satisfies Prisma.OrderInclude;

/** Delivery already priced on the server from the tenant's shipping settings (never from client input). */
export type OrderShipping = { cents: number; delivery: Prisma.InputJsonObject };

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    private readonly checkout: CheckoutService,
    private readonly email: OrderEmailService,
    private readonly inboxEvents: InboxEventsService,
    private readonly notifications: OrderNotificationsService,
  ) {}

  async list(
    tenantId: string,
    filters: {
      status?: OrderStatus;
      tab?: 'new' | 'all';
      q?: string;
    },
  ) {
    const where: Prisma.OrderWhereInput = { tenantId };

    if (filters.tab === 'new') {
      where.status = { in: ['DRAFT', 'PENDING_PAYMENT', 'PAID'] };
    } else if (filters.status) {
      where.status = filters.status;
    }

    if (filters.q) {
      where.OR = [
        { customerName: { contains: filters.q, mode: 'insensitive' } },
        { customerPhone: { contains: filters.q, mode: 'insensitive' } },
        { id: { contains: filters.q, mode: 'insensitive' } },
      ];
    }

    return this.prisma.order.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getById(tenantId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: ORDER_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException('Pedido no encontrado.');
    }
    return order;
  }

  async create(tenantId: string, dto: CreateOrderDto, shipping?: OrderShipping) {
    if (dto.conversationId) {
      const conversation = await this.prisma.conversation.findFirst({
        where: { id: dto.conversationId, tenantId },
      });
      if (!conversation) {
        throw new NotFoundException('Conversación no encontrada.');
      }
    }

    for (const item of dto.items) {
      if (item.productId) {
        const product = await this.prisma.product.findFirst({
          where: { id: item.productId, tenantId },
        });
        if (!product) {
          throw new BadRequestException('Algún producto del pedido ya no existe.');
        }
      }
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });

    const currency = dto.currency ?? tenant.currency;
    const items = dto.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      title: item.title,
      quantity: item.quantity,
      unitCents: item.unitCents,
      totalCents: item.quantity * item.unitCents,
    }));
    const subtotalCents = items.reduce((sum, item) => sum + item.totalCents, 0);
    const shippingCents = shipping?.cents ?? 0;
    const totalCents = subtotalCents + shippingCents;

    let customerName = dto.customerName;
    let customerPhone = dto.customerPhone;
    let channel: OrderChannel = 'MANUAL';
    if (dto.conversationId) {
      const conversation = await this.prisma.conversation.findFirst({
        where: { id: dto.conversationId, tenantId },
        include: { channel: { select: { type: true } } },
      });
      customerName = customerName ?? conversation?.contactName ?? undefined;
      customerPhone = customerPhone ?? conversation?.contactPhone ?? undefined;
      channel = conversation?.channel.type ?? 'MANUAL';
    }

    const order = await this.prisma.order.create({
      data: {
        tenantId,
        conversationId: dto.conversationId,
        status: 'DRAFT',
        channel,
        currency,
        subtotalCents,
        shippingCents,
        totalCents,
        ...(shipping ? { delivery: shipping.delivery } : {}),
        customerName,
        customerPhone,
        items: { create: items },
      },
      include: ORDER_INCLUDE,
    });

    if (dto.conversationId) {
      await this.prisma.message.create({
        data: {
          conversationId: dto.conversationId,
          direction: 'OUTBOUND',
          authorType: 'SYSTEM',
          body: `Pedido creado · ${items.length} ítem(s) · ${(totalCents / 100).toFixed(2)} ${currency}`,
        },
      });
      this.inboxEvents.publish(tenantId, dto.conversationId);
    }

    if (dto.createPaymentLink) {
      return this.createPaymentLink(tenantId, order.id, {
        sendLinkToChat: dto.sendLinkToChat ?? Boolean(dto.conversationId),
      });
    }

    return order;
  }

  async createPaymentLink(
    tenantId: string,
    orderId: string,
    dto: CreatePaymentLinkDto = {},
  ) {
    const order = await this.getById(tenantId, orderId);
    const payment = await this.paymentsService.createCommerceCheckout({
      tenantId,
      orderId: order.id,
      title: `Pedido ${order.id.slice(-6).toUpperCase()} · VendedorIA`,
      amountCents: order.totalCents,
      currency: order.currency,
    });

    if (dto.sendLinkToChat && order.conversationId && payment.checkoutUrl) {
      await this.prisma.message.create({
        data: {
          conversationId: order.conversationId,
          direction: 'OUTBOUND',
          authorType: 'SYSTEM',
          body: `Link de pago listo (${(order.totalCents / 100).toFixed(2)} ${order.currency}):\n${payment.checkoutUrl}`,
        },
      });
      this.inboxEvents.publish(tenantId, order.conversationId);
    }

    return this.getById(tenantId, orderId);
  }

  async updateStatus(
    tenantId: string,
    orderId: string,
    dto: UpdateOrderStatusDto,
  ) {
    const order = await this.getById(tenantId, orderId);
    this.assertTransition(order.status, dto.status);
    const trackingCode = dto.trackingCode?.trim() || null;
    if (order.status === dto.status) {
      if (dto.status === 'SHIPPED' && trackingCode && trackingCode !== order.trackingCode) {
        await this.prisma.order.update({ where: { id: order.id }, data: { trackingCode } });
        return this.getById(tenantId, orderId);
      }
      return order;
    }
    const pickup = (order.delivery as { mode?: string } | null)?.mode === 'PICKUP';
    if (dto.status === 'SHIPPED' && !pickup && order.channel === 'WEB' && !trackingCode) {
      throw new BadRequestException('Ingresa el código de seguimiento del envío.');
    }

    const paidNow = await this.prisma.$transaction(async (tx) => {
      if (dto.status === 'CANCELLED') {
        await releaseOrder(tx, order, 'Cancelado desde la consola');
      } else if (dto.status === 'PAID') {
        return settlePaidOrder(tx, order, 'Marcado como pagado en la consola');
      } else {
        await tx.order.update({
          where: { id: order.id },
          data: { status: dto.status, ...(dto.status === 'SHIPPED' && trackingCode ? { trackingCode } : {}) },
        });
      }
      return false;
    });
    if (order.conversationId) {
      this.inboxEvents.publish(tenantId, order.conversationId, 'conversation');
      if (paidNow) await this.notifications.paymentConfirmed(tenantId, order.id);
    }
    if (dto.status === 'SHIPPED' || dto.status === 'COMPLETED') {
      await this.email.sendLogistics(order.id);
    }
    return this.getById(tenantId, orderId);
  }

  reconcile(tenantId: string, orderId: string, dto: ReconcileOrderDto) {
    return this.checkout.reconcile(tenantId, orderId, dto.providerOrderId);
  }

  emailPreview(tenantId: string, orderId: string) {
    return this.email.preview(tenantId, orderId);
  }

  private assertTransition(from: OrderStatus, to: OrderStatus) {
    if (from === to) return;
    const allowed: Record<OrderStatus, OrderStatus[]> = {
      DRAFT: ['PENDING_PAYMENT', 'PAID', 'CANCELLED'],
      PENDING_PAYMENT: ['PAID', 'CANCELLED', 'DRAFT'],
      PAID: ['FULFILLING', 'SHIPPED', 'COMPLETED', 'CANCELLED'],
      FULFILLING: ['SHIPPED', 'COMPLETED', 'CANCELLED'],
      SHIPPED: ['COMPLETED', 'CANCELLED'],
      COMPLETED: [],
      CANCELLED: [],
    };
    if (!allowed[from].includes(to)) {
      throw new BadRequestException(
        `Invalid status transition from ${from} to ${to}`,
      );
    }
  }
}
