import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlanTier } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getPlanDefinition, PlanStatus, resolvePlanState } from './plan-catalog';

export type PlanUsageSnapshot = {
  planTier: PlanTier;
  planStatus: PlanStatus;
  planExpiresAt: string | null;
  conversationsUsed: number;
  conversationQuota: number | null;
  productsUsed: number;
  productQuota: number | null;
  couponsActive: number;
  couponQuota: number | null;
  conversationAtLimit: boolean;
  productAtLimit: boolean;
  couponAtLimit: boolean;
  periodStart: string;
};

const atLimit = (used: number, quota: number | null) => quota !== null && used >= quota;

@Injectable()
export class PlanLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsage(tenantId: string): Promise<PlanUsageSnapshot> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Negocio no encontrado.');
    }

    const monthStart = this.currentPeriodStart();
    const [conversationsUsed, productsUsed, couponsActive] = await Promise.all([
      this.prisma.conversation.count({
        where: { tenantId, createdAt: { gte: monthStart } },
      }),
      this.prisma.product.count({ where: { tenantId } }),
      this.prisma.coupon.count({ where: { tenantId, isActive: true } }),
    ]);

    const state = resolvePlanState(tenant);
    return {
      planTier: state.plan.id,
      planStatus: state.status,
      planExpiresAt: tenant.planExpiresAt?.toISOString() ?? null,
      conversationsUsed,
      conversationQuota: state.conversationQuota,
      productsUsed,
      productQuota: state.productQuota,
      couponsActive,
      couponQuota: state.couponQuota,
      conversationAtLimit: atLimit(conversationsUsed, state.conversationQuota),
      productAtLimit: atLimit(productsUsed, state.productQuota),
      couponAtLimit: atLimit(couponsActive, state.couponQuota),
      periodStart: monthStart.toISOString(),
    };
  }

  async assertCanCreateProduct(tenantId: string): Promise<void> {
    const usage = await this.getUsage(tenantId);
    if (usage.planStatus === 'EXPIRED') {
      throw new ForbiddenException(
        'Tu plan venció. Renueva tu plan en Planes para publicar productos.',
      );
    }
    if (usage.productAtLimit) {
      throw new ForbiddenException(
        `Llegaste a ${usage.productQuota} productos, el máximo ${this.planLabel(usage)}. Cambia de plan en Planes para publicar más.`,
      );
    }
  }

  async assertCanStartConversation(tenantId: string): Promise<void> {
    const usage = await this.getUsage(tenantId);
    if (usage.planStatus === 'EXPIRED') {
      throw new ForbiddenException(
        'Tu plan venció. Renueva tu plan en Planes para que tu vendedor IA atienda chats nuevos.',
      );
    }
    if (usage.conversationAtLimit) {
      throw new ForbiddenException(
        `Llegaste a ${usage.conversationQuota} chats nuevos este mes, el máximo ${this.planLabel(usage)}. Cambia de plan en Planes o espera al próximo mes.`,
      );
    }
  }

  /** Called before a coupon becomes active (new active coupon or reactivation). */
  async assertCanActivateCoupon(tenantId: string): Promise<void> {
    const usage = await this.getUsage(tenantId);
    if (usage.couponAtLimit) {
      throw new ForbiddenException(
        `Ya tienes ${usage.couponQuota} cupones activos, el máximo ${this.planLabel(usage)}. Desactiva uno o cambia de plan en Planes.`,
      );
    }
  }

  private planLabel(usage: PlanUsageSnapshot): string {
    if (usage.planStatus === 'TRIAL') return 'de tu prueba gratis';
    return `del plan ${getPlanDefinition(usage.planTier).name}`;
  }

  private currentPeriodStart(): Date {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    return monthStart;
  }
}
