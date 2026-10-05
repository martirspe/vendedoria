import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type {
  RecoveryCaptureResult,
  RecoveredCart,
  RecoveryCartLine,
} from '@vendedoria/contracts';
import { PrismaService } from '../prisma/prisma.service';
import {
  PRODUCT_INCLUDE,
  StoreAccess,
  StorefrontPublicService,
} from '../storefront/storefront-public.service';
import { toProductDetail } from '../storefront/storefront-mapper';
import {
  ConversionSettingsDto,
  RecoveryCaptureDto,
} from './dto/conversion.dto';
import {
  RECOVERY_CONSENT_VERSION,
  RECOVERY_TTL_MS,
  recoveryId,
  recoveryToken,
  sessionHash,
} from './recovery-token';

export type RecoveryItem = {
  handle: string;
  variantId?: string;
  quantity: number;
};
export function readRecoveryItems(value: Prisma.JsonValue): RecoveryItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      typeof item.handle !== 'string' ||
      typeof item.quantity !== 'number'
    )
      return [];
    return [
      {
        handle: item.handle,
        quantity: item.quantity,
        ...(typeof item.variantId === 'string'
          ? { variantId: item.variantId }
          : {}),
      },
    ];
  });
}

@Injectable()
export class RecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storefront: StorefrontPublicService,
  ) {}
  private get secret(): string {
    return this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }
  async summary(tenantId: string) {
    const [deliveries, savedCarts, resumedCarts] = await Promise.all([
      this.prisma.recoveryDelivery.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { _all: true },
      }),
      this.prisma.recoveryCart.count({
        where: {
          tenantId,
          revokedAt: null,
          orderId: null,
          expiresAt: { gt: new Date() },
        },
      }),
      this.prisma.recoveryCart.count({
        where: { tenantId, orderId: { not: null } },
      }),
    ]);
    return {
      savedCarts,
      resumedCarts,
      deliveries: Object.fromEntries(
        deliveries.map((d) => [d.status, d._count._all]),
      ),
    };
  }
  async settings(tenantId: string) {
    return (
      (await this.prisma.conversionSettings.findUnique({
        where: { tenantId },
      })) ?? {
        recoveryEnabled: false,
        emailEnabled: true,
        whatsappEnabled: false,
        whatsappTemplate: null,
        whatsappLanguage: 'es_PE',
        delaysMinutes: [15, 120, 1440],
      }
    );
  }
  async saveSettings(tenantId: string, dto: ConversionSettingsDto) {
    if (
      dto.delaysMinutes.some(
        (delay, i) => i > 0 && delay <= dto.delaysMinutes[i - 1],
      )
    )
      throw new BadRequestException(
        'Los intervalos deben estar ordenados de menor a mayor.',
      );
    if (dto.recoveryEnabled && !this.config.get<string>('REDIS_URL'))
      throw new ServiceUnavailableException(
        'Los recordatorios aún no están disponibles.',
      );
    if (
      dto.recoveryEnabled &&
      dto.emailEnabled &&
      this.config.get<string>('EMAIL_MODE') === 'live' &&
      !this.config.get<string>('RECOVERY_EMAIL_FROM')
    )
      throw new BadRequestException(
        'Configura el remitente de recordatorios antes de activarlos.',
      );
    if (dto.whatsappEnabled && !dto.whatsappTemplate)
      throw new BadRequestException(
        'Indica una plantilla aprobada de WhatsApp.',
      );
    if (dto.recoveryEnabled && !dto.emailEnabled && !dto.whatsappEnabled)
      throw new BadRequestException('Activa al menos un canal.');
    await this.storefront.getStore({ tenantId, isPreview: false });
    return this.prisma.conversionSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...dto },
      update: { ...dto, whatsappTemplate: dto.whatsappTemplate ?? null },
    });
  }
  async availability(access: StoreAccess) {
    const settings = await this.settings(access.tenantId);
    const enabled =
      !access.isPreview &&
      settings.recoveryEnabled &&
      Boolean(this.config.get<string>('REDIS_URL'));
    return {
      email: enabled && settings.emailEnabled,
      whatsapp: enabled && settings.whatsappEnabled,
      consentVersion: RECOVERY_CONSENT_VERSION,
    };
  }
  async capture(
    access: StoreAccess,
    dto: RecoveryCaptureDto,
  ): Promise<RecoveryCaptureResult> {
    const settings = await this.settings(access.tenantId);
    if (
      access.isPreview ||
      !settings.recoveryEnabled ||
      !this.config.get<string>('REDIS_URL')
    )
      throw new ConflictException(
        'Los recordatorios no están disponibles en esta tienda.',
      );
    if (
      (!dto.emailConsent && !dto.whatsappConsent) ||
      (dto.emailConsent && (!dto.email || !settings.emailEnabled)) ||
      (dto.whatsappConsent && (!dto.phone || !settings.whatsappEnabled))
    )
      throw new BadRequestException(
        'Elige un canal disponible y autoriza los recordatorios.',
      );
    if (
      new Set(dto.items.map((item) => `${item.handle}/${item.variantId ?? ''}`))
        .size !== dto.items.length
    )
      throw new BadRequestException('Revisa los productos de tu carrito.');
    const restored = await this.lines(access.tenantId, dto.items);
    if (restored.lines.length !== dto.items.length || restored.changed)
      throw new ConflictException(
        'Revisa la disponibilidad y las cantidades antes de guardar tu carrito.',
      );
    const now = new Date();
    const hash = sessionHash(this.secret, access.tenantId, dto.sessionId);
    const cart = await this.prisma.$transaction(async (tx) => {
      const tokenId = dto.token
        ? recoveryId(this.secret, access.tenantId, dto.token)
        : null;
      if (dto.token && !tokenId)
        throw new ConflictException('El enlace de recuperación venció.');
      let existing = tokenId
        ? await tx.recoveryCart.findFirst({
            where: { id: tokenId, tenantId: access.tenantId },
          })
        : await tx.recoveryCart.findUnique({
            where: {
              tenantId_sessionHash: {
                tenantId: access.tenantId,
                sessionHash: hash,
              },
            },
          });
      if (tokenId && !existing)
        throw new ConflictException('Este enlace ya no está disponible.');
      if (existing) {
        // Serialize consent edits against opt-out, reservation and delivery claims.
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "RecoveryCart" WHERE id = ${existing.id} AND "tenantId" = ${access.tenantId} FOR UPDATE`,
        );
        existing = await tx.recoveryCart.findFirst({
          where: { id: existing.id, tenantId: access.tenantId },
        });
        if (!existing)
          throw new ConflictException('Este enlace ya no está disponible.');
      }
      if (
        existing &&
        (!dto.token ||
          recoveryId(this.secret, access.tenantId, dto.token) !== existing.id ||
          existing.revokedAt ||
          existing.orderId ||
          existing.expiresAt <= now)
      )
        throw new ConflictException(
          'Inicia una nueva selección para guardar otro carrito.',
        );
      const data = {
        items: dto.items.map((item) => ({ ...item })) as Prisma.InputJsonValue,
        email: dto.emailConsent ? dto.email!.trim().toLowerCase() : null,
        phone: dto.whatsappConsent ? dto.phone!.replace(/\D/g, '') : null,
        emailConsentAt: dto.emailConsent ? now : null,
        whatsappConsentAt: dto.whatsappConsent ? now : null,
        consentVersion: RECOVERY_CONSENT_VERSION,
        lastActivityAt: now,
      };
      const saved = existing
        ? await tx.recoveryCart.update({
            where: { id: existing.id, tenantId: access.tenantId },
            data: { ...data, revision: { increment: 1 } },
          })
        : await tx.recoveryCart.create({
            data: {
              ...data,
              tenantId: access.tenantId,
              sessionHash: hash,
              expiresAt: new Date(now.getTime() + RECOVERY_TTL_MS),
            },
          });
      await tx.recoveryDelivery.updateMany({
        where: {
          tenantId: access.tenantId,
          cartId: saved.id,
          status: 'PENDING',
        },
        data: { status: 'CANCELLED' },
      });
      await tx.recoveryDelivery.createMany({
        data: settings.delaysMinutes.flatMap((minutes, step) =>
          [
            ...(dto.emailConsent ? ['EMAIL'] : []),
            ...(dto.whatsappConsent ? ['WHATSAPP'] : []),
          ].map((channel) => ({
            tenantId: access.tenantId,
            cartId: saved.id,
            revision: saved.revision,
            step,
            channel,
            dueAt: new Date(now.getTime() + minutes * 60_000),
          })),
        ),
      });
      return saved;
    });
    return {
      token: recoveryToken(
        this.secret,
        access.tenantId,
        cart.id,
        cart.expiresAt,
      ),
      expiresAt: cart.expiresAt.toISOString(),
    };
  }
  async restore(access: StoreAccess, token: string): Promise<RecoveredCart> {
    const cart = await this.authorized(access.tenantId, token);
    const restored = await this.lines(
      access.tenantId,
      readRecoveryItems(cart.items),
    );
    // Opening the link postpones pending reminders; a reservation stops them transactionally.
    await this.prisma.recoveryCart.updateMany({
      where: { id: cart.id, tenantId: access.tenantId },
      data: { lastActivityAt: new Date() },
    });
    return { ...restored, expiresAt: cart.expiresAt.toISOString() };
  }
  async activity(access: StoreAccess, token: string, items: RecoveryItem[]) {
    const cart = await this.authorized(access.tenantId, token);
    const restored = await this.lines(access.tenantId, items);
    if (
      restored.changed ||
      restored.lines.length !== items.length ||
      new Set(items.map((item) => `${item.handle}/${item.variantId ?? ''}`))
        .size !== items.length
    )
      throw new ConflictException('Revisa la disponibilidad del carrito.');
    await this.prisma.recoveryCart.updateMany({
      where: {
        id: cart.id,
        tenantId: access.tenantId,
        orderId: null,
        revokedAt: null,
      },
      data: {
        lastActivityAt: new Date(),
        items: items.map((item) => ({ ...item })) as Prisma.InputJsonValue,
      },
    });
    return { active: true };
  }
  async revoke(access: StoreAccess, token: string) {
    const cart = await this.authorized(access.tenantId, token, true);
    await this.prisma.$transaction([
      this.prisma.recoveryCart.updateMany({
        where: { id: cart.id, tenantId: access.tenantId },
        data: {
          revokedAt: new Date(),
          email: null,
          phone: null,
          emailConsentAt: null,
          whatsappConsentAt: null,
        },
      }),
      this.prisma.recoveryDelivery.updateMany({
        where: {
          cartId: cart.id,
          tenantId: access.tenantId,
          status: 'PENDING',
        },
        data: { status: 'CANCELLED' },
      }),
    ]);
    return { revoked: true };
  }
  private async authorized(
    tenantId: string,
    token: string,
    allowStopped = false,
  ) {
    const id = recoveryId(this.secret, tenantId, token);
    const cart = id
      ? await this.prisma.recoveryCart.findFirst({
          where: {
            id,
            tenantId,
            expiresAt: { gt: new Date() },
            ...(allowStopped ? {} : { revokedAt: null, orderId: null }),
          },
        })
      : null;
    if (!cart)
      throw new NotFoundException('Este enlace ya no está disponible.');
    return cart;
  }
  async lines(
    tenantId: string,
    items: RecoveryItem[],
  ): Promise<{ lines: RecoveryCartLine[]; changed: boolean }> {
    const products = await this.prisma.product.findMany({
      where: {
        tenantId,
        handle: { in: items.map((item) => item.handle) },
        isPublishedOnStore: true,
      },
      include: PRODUCT_INCLUDE,
    });
    let changed = false;
    const lines = items.flatMap((item) => {
      const record = products.find((p) => p.handle === item.handle);
      if (!record) {
        changed = true;
        return [];
      }
      const product = toProductDetail(record, []);
      const variant = product.variants.find((v) => v.id === item.variantId);
      if (
        !product.isAvailable ||
        (product.hasVariants && !variant?.isAvailable) ||
        (!product.hasVariants && item.variantId)
      ) {
        changed = true;
        return [];
      }
      let stock = Number.POSITIVE_INFINITY;
      if (record.components.length) {
        for (const piece of record.components)
          if (
            !piece.component.stockUnlimited &&
            piece.component.stockQty !== null
          )
            stock = Math.min(
              stock,
              Math.floor(piece.component.stockQty / piece.quantity),
            );
      } else if (
        variant &&
        record.variants.find((v) => v.id === variant.id)?.stockQty !== null
      ) {
        stock = record.variants.find((v) => v.id === variant.id)!.stockQty!;
      } else if (!record.stockUnlimited && record.stockQty !== null)
        stock = record.stockQty;
      const max = Math.min(20, stock);
      const quantity = Math.min(item.quantity, max);
      if (quantity !== item.quantity) changed = true;
      if (quantity <= 0) return [];
      return [
        {
          handle: product.handle,
          name: product.name,
          variantId: variant?.id ?? null,
          variantLabel: variant?.label ?? null,
          unitCents: variant?.priceCents ?? product.priceCents,
          currency: product.currency,
          imageUrl: variant?.imageUrl ?? product.imageUrl,
          quantity,
          isService: product.kind === 'SERVICE',
          isDigital: product.kind === 'DIGITAL',
          stockLeft: Number.isFinite(stock) ? stock : null,
        },
      ];
    });
    return { lines, changed };
  }
}
