import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(tenantId: string, days = 7) {
    const safeDays = Math.min(90, Math.max(1, days));
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (safeDays - 1));

    const [
      conversations,
      inboundMessages,
      agentMessages,
      ordersCreated,
      paidOrders,
      revenueAgg,
      unattendedOpen,
    ] = await Promise.all([
      this.prisma.conversation.count({
        where: { tenantId, createdAt: { gte: from } },
      }),
      this.prisma.message.count({
        where: {
          direction: 'INBOUND',
          createdAt: { gte: from },
          conversation: { tenantId },
        },
      }),
      this.prisma.message.count({
        where: {
          authorType: 'SALES_AGENT',
          createdAt: { gte: from },
          conversation: { tenantId },
        },
      }),
      this.prisma.order.count({
        where: { tenantId, createdAt: { gte: from } },
      }),
      this.prisma.order.count({
        where: {
          tenantId,
          createdAt: { gte: from },
          status: { in: ['PAID', 'FULFILLING', 'SHIPPED', 'COMPLETED'] },
        },
      }),
      this.prisma.order.aggregate({
        where: {
          tenantId,
          createdAt: { gte: from },
          status: { in: ['PAID', 'FULFILLING', 'SHIPPED', 'COMPLETED'] },
        },
        _sum: { totalCents: true },
      }),
      this.prisma.conversation.count({
        where: { tenantId, markedUnattended: true, status: { not: 'CLOSED' } },
      }),
    ]);

    const conversionRate =
      conversations === 0 ? 0 : Math.round((paidOrders / conversations) * 1000) / 10;

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { currency: true },
    });

    return {
      periodDays: safeDays,
      from: from.toISOString(),
      to: new Date().toISOString(),
      currency: tenant.currency,
      conversations,
      inboundMessages,
      agentMessages,
      ordersCreated,
      paidOrders,
      revenueCents: revenueAgg._sum.totalCents ?? 0,
      conversionRate,
      unattendedOpen,
    };
  }
}
