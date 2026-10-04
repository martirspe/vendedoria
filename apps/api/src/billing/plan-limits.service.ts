import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlanTier } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AI_REPLIES_PER_CHAT,
  currentPeriodStart,
  getPlanDefinition,
  IntegrationKey,
  planAllows,
  PlanState,
  PlanStatus,
  resolvePlanState,
} from './plan-catalog';

export type PlanUsageSnapshot = {
  planTier: PlanTier;
  planStatus: PlanStatus;
  planExpiresAt: string | null;
  conversationsUsed: number;
  /** Plan quota plus the chat packs bought for this month. */
  conversationQuota: number | null;
  extraChats: number;
  aiRepliesUsed: number;
  aiReplyQuota: number | null;
  aiTextsUsed: number;
  aiTextQuota: number | null;
  aiImagesUsed: number;
  aiImageQuota: number | null;
  productsUsed: number;
  productQuota: number | null;
  couponsActive: number;
  couponQuota: number | null;
  /** Members plus pending invitations. */
  seatsUsed: number;
  seatQuota: number | null;
  conversationAtLimit: boolean;
  aiAtLimit: boolean;
  aiTextAtLimit: boolean;
  aiImageAtLimit: boolean;
  productAtLimit: boolean;
  couponAtLimit: boolean;
  seatAtLimit: boolean;
  integrations: IntegrationKey[];
  periodStart: string;
};

export type EditorAiKind = 'text' | 'image';

const atLimit = (used: number, quota: number | null) => quota !== null && used >= quota;
const plus = (quota: number | null, extra: number) => (quota === null ? null : quota + extra);

@Injectable()
export class PlanLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlanState(tenantId: string): Promise<PlanState> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { planTier: true, planTrial: true, planExpiresAt: true },
    });
    if (!tenant) {
      throw new NotFoundException('Negocio no encontrado.');
    }
    return resolvePlanState(tenant);
  }

  async getUsage(tenantId: string): Promise<PlanUsageSnapshot> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Negocio no encontrado.');
    }

    const periodStart = currentPeriodStart();
    const now = new Date();
    const [conversationsUsed, productsUsed, couponsActive, packs, aiUsage, members, invites] =
      await Promise.all([
        this.prisma.conversation.count({
          where: { tenantId, createdAt: { gte: periodStart } },
        }),
        this.prisma.product.count({ where: { tenantId } }),
        this.prisma.coupon.count({ where: { tenantId, isActive: true } }),
        this.prisma.chatPack.aggregate({
          where: { tenantId, periodStart },
          _sum: { chats: true },
        }),
        this.prisma.aiUsageMonth.findUnique({
          where: { tenantId_periodStart: { tenantId, periodStart } },
          select: { replies: true, editorTexts: true, editorImages: true },
        }),
        this.prisma.membership.count({ where: { tenantId } }),
        this.prisma.memberInvite.count({
          where: { tenantId, acceptedAt: null, expiresAt: { gt: now } },
        }),
      ]);

    const state = resolvePlanState(tenant, now);
    const expired = state.status === 'EXPIRED';
    const extraChats = expired ? 0 : (packs._sum.chats ?? 0);
    const conversationQuota = plus(state.conversationQuota, extraChats);
    const aiReplyQuota = plus(state.aiReplyQuota, extraChats * AI_REPLIES_PER_CHAT);
    const aiRepliesUsed = aiUsage?.replies ?? 0;
    const aiTextsUsed = aiUsage?.editorTexts ?? 0;
    const aiImagesUsed = aiUsage?.editorImages ?? 0;
    const seatsUsed = members + invites;
    return {
      planTier: state.plan.id,
      planStatus: state.status,
      planExpiresAt: tenant.planExpiresAt?.toISOString() ?? null,
      conversationsUsed,
      conversationQuota,
      extraChats,
      aiRepliesUsed,
      aiReplyQuota,
      aiTextsUsed,
      aiTextQuota: state.aiTextQuota,
      aiImagesUsed,
      aiImageQuota: state.aiImageQuota,
      productsUsed,
      productQuota: state.productQuota,
      couponsActive,
      couponQuota: state.couponQuota,
      seatsUsed,
      seatQuota: state.seatQuota,
      conversationAtLimit: atLimit(conversationsUsed, conversationQuota),
      aiAtLimit: atLimit(aiRepliesUsed, aiReplyQuota),
      aiTextAtLimit: atLimit(aiTextsUsed, state.aiTextQuota),
      aiImageAtLimit: atLimit(aiImagesUsed, state.aiImageQuota),
      productAtLimit: atLimit(productsUsed, state.productQuota),
      couponAtLimit: atLimit(couponsActive, state.couponQuota),
      seatAtLimit: atLimit(seatsUsed, state.seatQuota),
      integrations: state.integrations,
      periodStart: periodStart.toISOString(),
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
        `Llegaste a ${usage.conversationQuota} chats nuevos este mes, el máximo ${this.planLabel(usage)}. Suma chats extra o cambia de plan en Planes.`,
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

  /** Called before inviting someone: members plus pending invitations fill the seats. */
  async assertCanAddMember(tenantId: string): Promise<void> {
    const usage = await this.getUsage(tenantId);
    if (usage.seatAtLimit) {
      throw new ForbiddenException(
        `Tu equipo ya tiene ${usage.seatQuota} usuarios, el máximo ${this.planLabel(usage)}. Cancela una invitación o cambia de plan en Planes.`,
      );
    }
  }

  async assertIntegrationAllowed(tenantId: string, key: IntegrationKey): Promise<void> {
    const state = await this.getPlanState(tenantId);
    if (!planAllows(state, key)) {
      throw new ForbiddenException(
        state.status === 'EXPIRED'
          ? 'Tu plan venció. Renueva tu plan en Planes para usar esta integración.'
          : 'Tu plan no incluye esta integración. Cambia de plan en Planes para activarla.',
      );
    }
  }

  /** False once the month's AI replies are used: the agent then answers without OpenAI. */
  async canUseAi(tenantId: string): Promise<boolean> {
    const usage = await this.getUsage(tenantId);
    return !usage.aiAtLimit;
  }

  async recordAiReply(tenantId: string): Promise<void> {
    const periodStart = currentPeriodStart();
    await this.prisma.aiUsageMonth.upsert({
      where: { tenantId_periodStart: { tenantId, periodStart } },
      create: { tenantId, periodStart, replies: 1 },
      update: { replies: { increment: 1 } },
    });
  }

  /** Store editor AI, capped apart from the agent replies. */
  async assertCanUseEditorAi(tenantId: string, kind: EditorAiKind): Promise<void> {
    const usage = await this.getUsage(tenantId);
    if (usage.planStatus === 'EXPIRED') {
      throw new ForbiddenException('Tu plan venció. Renueva tu plan en Planes para usar la IA en tu tienda.');
    }
    const [atCap, quota, noun] =
      kind === 'text'
        ? [usage.aiTextAtLimit, usage.aiTextQuota, 'textos']
        : [usage.aiImageAtLimit, usage.aiImageQuota, 'imágenes'];
    if (atCap) {
      throw new ForbiddenException(
        quota
          ? `Usaste los ${quota} ${noun} con IA de este mes, el máximo ${this.planLabel(usage)}. Se renuevan el 1 de cada mes, o cambia de plan en Planes.`
          : `Tu plan no incluye ${noun} con IA para tu tienda. Cambia de plan en Planes para usarlos.`,
      );
    }
  }

  async recordEditorAi(tenantId: string, kind: EditorAiKind): Promise<void> {
    const periodStart = currentPeriodStart();
    await this.prisma.aiUsageMonth.upsert({
      where: { tenantId_periodStart: { tenantId, periodStart } },
      create:
        kind === 'text' ? { tenantId, periodStart, editorTexts: 1 } : { tenantId, periodStart, editorImages: 1 },
      update: kind === 'text' ? { editorTexts: { increment: 1 } } : { editorImages: { increment: 1 } },
    });
  }

  private planLabel(usage: PlanUsageSnapshot): string {
    if (usage.planStatus === 'TRIAL') return 'de tu prueba gratis';
    return `del plan ${getPlanDefinition(usage.planTier).name}`;
  }
}
