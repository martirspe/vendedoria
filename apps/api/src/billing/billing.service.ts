import { Injectable, NotFoundException } from '@nestjs/common';
import { PlanTier } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getPlanDefinition, PLAN_CATALOG } from './plan-catalog';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [conversationsUsed, productsUsed] = await Promise.all([
      this.prisma.conversation.count({
        where: { tenantId, createdAt: { gte: monthStart } },
      }),
      this.prisma.product.count({ where: { tenantId } }),
    ]);

    const current = getPlanDefinition(tenant.planTier);

    return {
      flow: 'A' as const,
      notice:
        'Esto es la suscripción SaaS del merchant (flujo A), distinta del cobro al comprador (flujo B).',
      currentPlan: current,
      usage: {
        conversationsUsed,
        conversationQuota: current.conversationQuota,
        productsUsed,
        productQuota: current.productQuota,
        periodStart: monthStart.toISOString(),
      },
      plans: PLAN_CATALOG,
      checkoutEnabled: false,
      checkoutHint:
        'El cobro de plan aún es manual / mock en desarrollo. Cambiar plan solo actualiza tu cuota visible.',
    };
  }

  async updatePlan(tenantId: string, planTier: PlanTier) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { planTier },
    });
    return this.getOverview(tenantId);
  }
}
