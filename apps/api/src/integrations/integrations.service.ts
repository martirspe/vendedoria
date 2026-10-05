import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  firstPlanWith,
  IntegrationKey,
  planAllows,
} from '../billing/plan-catalog';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { assertManager } from '../common/roles';
import type { AuthUserPayload } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CustomDomainService } from './custom-domain.service';
import {
  INTEGRATION_KEYS,
  INTEGRATION_REQUIRES,
  isIntegrationActive,
  isIntegrationKey,
  resolveActive,
} from './integration-state';
import { UpdateTrackingDto } from './dto/integrations.dto';

const MANAGER_MESSAGE = 'Solo el dueño o un administrador puede cambiar las integraciones.';
const INTEGRATION_NAMES: Record<IntegrationKey, string> = {
  store: 'Tienda web',
  custom_domain: 'Dominio propio',
  instagram: 'Instagram Direct',
  tracking: 'Píxel y Analytics',
  team: 'Equipo',
  tiktok_live: 'TikTok LIVE',
};

export type IntegrationStateView = {
  key: IntegrationKey;
  /** The business turned it on. */
  enabled: boolean;
  /** Working now: on, included in the plan and with its required integration active. */
  active: boolean;
  /** The current plan includes it. */
  included: boolean;
  /** The platform can offer it right now. */
  available: boolean;
  /** Cheapest plan that includes it, for the upgrade hint. */
  requiredPlan: { id: string; name: string } | null;
  /** Integration it works on: it is paused while that one is off. */
  requires: IntegrationKey | null;
};

export type TrackingView = {
  metaPixelId: string | null;
  ga4MeasurementId: string | null;
  active: boolean;
};

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
    private readonly customDomain: CustomDomainService,
  ) {}

  async list(tenantId: string): Promise<IntegrationStateView[]> {
    const [state, records] = await Promise.all([
      this.planLimits.getPlanState(tenantId),
      this.prisma.tenantIntegration.findMany({ where: { tenantId }, select: { key: true, enabled: true } }),
    ]);
    const enabledKeys = new Set(records.filter((record) => record.enabled).map((record) => record.key));
    return INTEGRATION_KEYS.map((key) => {
      const plan = firstPlanWith(key);
      return {
        key,
        enabled: enabledKeys.has(key),
        active: resolveActive(key, enabledKeys, (item) => planAllows(state, item)),
        included: planAllows(state, key),
        available: key === 'custom_domain' ? this.customDomain.available : true,
        requiredPlan: plan ? { id: plan.id, name: plan.name } : null,
        requires: INTEGRATION_REQUIRES[key] ?? null,
      };
    });
  }

  async enable(user: AuthUserPayload, key: string): Promise<IntegrationStateView[]> {
    assertManager(user, MANAGER_MESSAGE);
    const integration = this.parse(key);
    const state = await this.planLimits.getPlanState(user.tenantId);
    if (!planAllows(state, integration)) {
      const plan = firstPlanWith(integration);
      throw new ForbiddenException(
        state.status === 'EXPIRED'
          ? 'Tu plan venció. Renueva tu plan en Planes para activar integraciones.'
          : `Esta integración está disponible desde el plan ${plan?.name ?? 'superior'}. Cámbiate en Planes para activarla.`,
      );
    }
    if (integration === 'custom_domain' && !this.customDomain.available) {
      throw new BadRequestException('El dominio propio aún no está disponible. Escríbenos desde Ayuda y te avisamos.');
    }
    const required = INTEGRATION_REQUIRES[integration];
    if (required && !(await isIntegrationActive(this.prisma, user.tenantId, required))) {
      throw new BadRequestException(
        `${INTEGRATION_NAMES[integration]} funciona sobre ${INTEGRATION_NAMES[required]}. Activa primero ${INTEGRATION_NAMES[required]}.`,
      );
    }
    await this.prisma.tenantIntegration.upsert({
      where: { tenantId_key: { tenantId: user.tenantId, key: integration } },
      create: { tenantId: user.tenantId, key: integration, enabled: true },
      update: { enabled: true },
    });
    return this.list(user.tenantId);
  }

  async disable(user: AuthUserPayload, key: string): Promise<IntegrationStateView[]> {
    assertManager(user, MANAGER_MESSAGE);
    const integration = this.parse(key);
    const tenantId = user.tenantId;
    if (integration === 'team') {
      const others = await this.prisma.membership.count({ where: { tenantId, role: { not: 'OWNER' } } });
      if (others > 0) {
        throw new BadRequestException('Quita a los miembros de tu equipo antes de desactivar Equipo.');
      }
      await this.prisma.memberInvite.deleteMany({ where: { tenantId, acceptedAt: null } });
    }
    if (integration === 'custom_domain') {
      await this.customDomain.clear(tenantId);
    }
    if (integration === 'instagram') {
      await this.prisma.channel.updateMany({
        where: { tenantId, type: 'INSTAGRAM' },
        data: { healthStatus: 'DISCONNECTED' },
      });
    }
    await this.prisma.tenantIntegration.updateMany({
      where: { tenantId, key: integration },
      data: { enabled: false },
    });
    return this.list(tenantId);
  }

  async getTracking(tenantId: string): Promise<TrackingView> {
    const [storefront, active] = await Promise.all([
      this.prisma.storefront.findUnique({
        where: { tenantId },
        select: { metaPixelId: true, ga4MeasurementId: true },
      }),
      isIntegrationActive(this.prisma, tenantId, 'tracking'),
    ]);
    return {
      metaPixelId: storefront?.metaPixelId ?? null,
      ga4MeasurementId: storefront?.ga4MeasurementId ?? null,
      active,
    };
  }

  async updateTracking(user: AuthUserPayload, dto: UpdateTrackingDto): Promise<TrackingView> {
    assertManager(user, MANAGER_MESSAGE);
    if (!(await isIntegrationActive(this.prisma, user.tenantId, 'tracking'))) {
      throw new ForbiddenException('Activa «Tienda web» y «Píxel y Analytics» en Integraciones para guardar tus códigos.');
    }
    const storefront = await this.prisma.storefront.findUnique({
      where: { tenantId: user.tenantId },
      select: { id: true },
    });
    if (!storefront) {
      throw new NotFoundException('Configura tu tienda web antes de conectar la analítica.');
    }
    await this.prisma.storefront.update({
      where: { tenantId: user.tenantId },
      data: {
        ...(dto.metaPixelId !== undefined ? { metaPixelId: dto.metaPixelId || null } : {}),
        ...(dto.ga4MeasurementId !== undefined ? { ga4MeasurementId: dto.ga4MeasurementId || null } : {}),
      },
    });
    return this.getTracking(user.tenantId);
  }

  private parse(key: string): IntegrationKey {
    if (!isIntegrationKey(key)) {
      throw new NotFoundException('Esa integración no existe.');
    }
    return key;
  }
}
