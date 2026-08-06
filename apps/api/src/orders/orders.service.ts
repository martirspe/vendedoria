import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import {
  CreateOrderDto,
  CreatePaymentLinkDto,
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

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
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
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async create(tenantId: string, dto: CreateOrderDto) {
    if (dto.conversationId) {
      const conversation = await this.prisma.conversation.findFirst({
        where: { id: dto.conversationId, tenantId },
      });
      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }
    }

    for (const item of dto.items) {
      if (item.productId) {
        const product = await this.prisma.product.findFirst({
          where: { id: item.productId, tenantId },
        });
        if (!product) {
          throw new BadRequestException(
            `Product not found: ${item.productId}`,
          );
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
    const totalCents = items.reduce((sum, item) => sum + item.totalCents, 0);

    let customerName = dto.customerName;
    let customerPhone = dto.customerPhone;
    if (dto.conversationId) {
      const conversation = await this.prisma.conversation.findFirst({
        where: { id: dto.conversationId, tenantId },
      });
      customerName = customerName ?? conversation?.contactName ?? undefined;
      customerPhone = customerPhone ?? conversation?.contactPhone ?? undefined;
    }

    const order = await this.prisma.order.create({
      data: {
        tenantId,
        conversationId: dto.conversationId,
        status: 'DRAFT',
        currency,
        totalCents,
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

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.status === 'CANCELLED' && order.status === 'PAID') {
        await this.releaseStock(tx, order.items);
      }

      if (
        dto.status === 'PAID' &&
        order.status !== 'PAID' &&
        order.status !== 'CANCELLED'
      ) {
        await this.decrementStock(tx, order.items);
        if (order.conversationId) {
          await tx.conversation.update({
            where: { id: order.conversationId },
            data: { markedAsSale: true },
          });
        }
      }

      return tx.order.update({
        where: { id: order.id },
        data: { status: dto.status },
        include: ORDER_INCLUDE,
      });
    });

    return updated;
  }

  private assertTransition(from: OrderStatus, to: OrderStatus) {
    if (from === to) return;
    const allowed: Record<OrderStatus, OrderStatus[]> = {
      DRAFT: ['PENDING_PAYMENT', 'PAID', 'CANCELLED'],
      PENDING_PAYMENT: ['PAID', 'CANCELLED', 'DRAFT'],
      PAID: ['FULFILLING', 'COMPLETED', 'CANCELLED'],
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

  private async decrementStock(
    tx: Prisma.TransactionClient,
    items: Array<{ productId: string | null; quantity: number }>,
  ) {
    for (const item of items) {
      if (!item.productId) continue;
      const product = await tx.product.findUnique({
        where: { id: item.productId },
      });
      if (!product || product.stockUnlimited || product.stockQty == null) {
        continue;
      }
      await tx.product.update({
        where: { id: product.id },
        data: { stockQty: Math.max(0, product.stockQty - item.quantity) },
      });
    }
  }

  private async releaseStock(
    tx: Prisma.TransactionClient,
    items: Array<{ productId: string | null; quantity: number }>,
  ) {
    for (const item of items) {
      if (!item.productId) continue;
      const product = await tx.product.findUnique({
        where: { id: item.productId },
      });
      if (!product || product.stockUnlimited || product.stockQty == null) {
        continue;
      }
      await tx.product.update({
        where: { id: product.id },
        data: { stockQty: product.stockQty + item.quantity },
      });
    }
  }
}
