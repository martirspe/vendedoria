import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getPlanDefinition } from './plan-catalog';

export type PlanUsageSnapshot = {
  planTier: string;
  conversationsUsed: number;
  conversationQuota: number | null;
  productsUsed: number;
  productQuota: number | null;
  conversationAtLimit: boolean;
  productAtLimit: boolean;
  periodStart: string;
};

@Injectable()
export class PlanLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsage(tenantId: string): Promise<PlanUsageSnapshot> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const monthStart = this.currentPeriodStart();
    const [conversationsUsed, productsUsed] = await Promise.all([
      this.prisma.conversation.count({
        where: { tenantId, createdAt: { gte: monthStart } },
      }),
      this.prisma.product.count({ where: { tenantId } }),
    ]);

    const plan = getPlanDefinition(tenant.planTier);
    const conversationAtLimit =
      plan.conversationQuota !== null &&
      conversationsUsed >= plan.conversationQuota;
    const productAtLimit =
      plan.productQuota !== null && productsUsed >= plan.productQuota;

    return {
      planTier: tenant.planTier,
      conversationsUsed,
      conversationQuota: plan.conversationQuota,
      productsUsed,
      productQuota: plan.productQuota,
      conversationAtLimit,
      productAtLimit,
      periodStart: monthStart.toISOString(),
    };
  }

  async assertCanCreateProduct(tenantId: string): Promise<void> {
    const usage = await this.getUsage(tenantId);
    if (usage.productAtLimit) {
      throw new ForbiddenException(
        `Alcanzaste el límite de ${usage.productQuota} productos en plan ${usage.planTier}. Sube de plan en Planes para seguir publicando.`,
      );
    }
  }

  async assertCanStartConversation(tenantId: string): Promise<void> {
    const usage = await this.getUsage(tenantId);
    if (usage.conversationAtLimit) {
      throw new ForbiddenException(
        `Alcanzaste el límite de ${usage.conversationQuota} conversaciones este mes en plan ${usage.planTier}. Sube de plan en Planes o espera al próximo periodo.`,
      );
    }
  }

  private currentPeriodStart(): Date {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    return monthStart;
  }
}
