import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { type Coupon, CouponMethod, OrderStatus, Prisma } from '@prisma/client';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  type CouponLine,
  couponRuleError,
  evaluateCoupon,
  normalizeCouponCode,
} from './coupon-engine';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';

type Db = Prisma.TransactionClient | PrismaService;

const LIVE_REDEMPTION: Prisma.EnumCouponRedemptionStatusFilter = {
  in: ['HELD', 'CONFIRMED'],
};
const PAID_STATUSES: OrderStatus[] = ['PAID', 'FULFILLING', 'SHIPPED', 'COMPLETED'];

export type CouponQuote = {
  coupon: Coupon;
  discountCents: number;
  freeShipping: boolean;
  customerKey: string | null;
};

export const couponCustomerKey = (email: string) =>
  createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

@Injectable()
export class CouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  async list(tenantId: string) {
    const [coupons, usage] = await Promise.all([
      this.prisma.coupon.findMany({
        where: { tenantId },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.couponRedemption.findMany({
        where: { coupon: { tenantId }, status: LIVE_REDEMPTION },
        select: { couponId: true, status: true, discountCents: true },
      }),
    ]);
    return coupons.map((coupon) => {
      const rows = usage.filter((row) => row.couponId === coupon.id);
      const confirmed = rows.filter((row) => row.status === 'CONFIRMED');
      return {
        ...coupon,
        usedCount: rows.length,
        confirmedCount: confirmed.length,
        discountGivenCents: confirmed.reduce((sum, row) => sum + row.discountCents, 0),
      };
    });
  }

  /** Values the console offers when scoping a coupon. */
  async targets(tenantId: string) {
    const products = await this.prisma.product.findMany({
      where: { tenantId },
      select: { handle: true, name: true, categories: true, brand: true, line: true },
      orderBy: { name: 'asc' },
    });
    const unique = (values: string[]) =>
      [...new Set(values)].sort((a, b) => a.localeCompare(b, 'es'));
    return {
      categories: unique(products.flatMap((p) => p.categories)),
      brands: unique(products.flatMap((p) => (p.brand ? [p.brand] : []))),
      lines: unique(products.flatMap((p) => (p.line ? [p.line] : []))),
      products: products.map((p) => ({ handle: p.handle, name: p.name })),
    };
  }

  async create(tenantId: string, dto: CreateCouponDto) {
    const method = dto.method ?? CouponMethod.CODE;
    const code = dto.code ? normalizeCouponCode(dto.code) : method === CouponMethod.AUTOMATIC ? this.automaticCode() : null;
    if (!code) throw new BadRequestException('Indica un código para el descuento.');
    const data = { ...this.toData(dto), method, code };
    this.assertRules(data);
    if (data.isActive !== false) {
      await this.planLimits.assertCanActivateCoupon(tenantId);
    }
    try {
      return await this.prisma.coupon.create({ data: { ...data, tenantId } });
    } catch (error) {
      throw this.mapConflict(error);
    }
  }

  async update(tenantId: string, id: string, dto: UpdateCouponDto) {
    const current = await this.getById(tenantId, id);
    const data = { ...current, ...this.toData(dto) };
    this.assertRules(data);
    if (data.isActive && !current.isActive) {
      await this.planLimits.assertCanActivateCoupon(tenantId);
    }
    try {
      return await this.prisma.coupon.update({
        where: { id },
        data: {
          code: data.code,
          method: data.method,
          label: data.label,
          note: data.note,
          kind: data.kind,
          value: data.value,
          maxDiscountCents: data.maxDiscountCents,
          buyQuantity: data.buyQuantity,
          getQuantity: data.getQuantity,
          maxApplications: data.maxApplications,
          minSubtotalCents: data.minSubtotalCents,
          minItems: data.minItems,
          scope: data.scope,
          targets: data.targets,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          usageLimit: data.usageLimit,
          perCustomerLimit: data.perCustomerLimit,
          firstOrderOnly: data.firstOrderOnly,
          applyToSets: data.applyToSets,
          isActive: data.isActive,
        },
      });
    } catch (error) {
      throw this.mapConflict(error);
    }
  }

  async remove(tenantId: string, id: string) {
    await this.getById(tenantId, id);
    const used = await this.prisma.couponRedemption.count({ where: { couponId: id } });
    if (used > 0) {
      throw new ConflictException(
        'Este cupón ya se usó en pedidos. Desactívalo para conservar el historial.',
      );
    }
    await this.prisma.coupon.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Validates a code against a cart. With `lock`, the coupon row is locked until the
   * surrounding transaction ends so concurrent checkouts cannot exceed usage limits.
   */
  async quote(
    db: Db,
    tenantId: string,
    input: { code: string; lines: CouponLine[]; email?: string | null },
    options: { lock?: boolean; method?: CouponMethod } = {},
  ): Promise<CouponQuote> {
    const code = normalizeCouponCode(input.code);
    if (options.lock) {
      await db.$queryRaw`SELECT id FROM "Coupon" WHERE "tenantId" = ${tenantId} AND code = ${code} FOR UPDATE`;
    }
    const coupon = await db.coupon.findUnique({
      where: { tenantId_code: { tenantId, code } },
    });
    if (!coupon) throw new BadRequestException('Este cupón no existe o ya no está disponible.');
    if (coupon.method !== (options.method ?? CouponMethod.CODE)) {
      throw new BadRequestException('Este descuento no está disponible con ese método.');
    }

    const result = evaluateCoupon(coupon, input.lines);
    if (!result.ok) throw new BadRequestException(result.reason);

    if (coupon.usageLimit !== null) {
      const used = await db.couponRedemption.count({
        where: { couponId: coupon.id, status: LIVE_REDEMPTION },
      });
      if (used >= coupon.usageLimit) {
        throw new BadRequestException('Este cupón alcanzó su límite de usos.');
      }
    }

    const email = input.email?.trim().toLowerCase() || null;
    const customerKey = email ? couponCustomerKey(email) : null;
    if (customerKey && coupon.perCustomerLimit !== null) {
      const mine = await db.couponRedemption.count({
        where: { couponId: coupon.id, customerKey, status: LIVE_REDEMPTION },
      });
      if (mine >= coupon.perCustomerLimit) {
        throw new BadRequestException('Ya usaste este cupón con este correo.');
      }
    }
    if (email && coupon.firstOrderOnly) {
      const previous = await db.order.count({
        where: {
          tenantId,
          customerEmail: { equals: email, mode: 'insensitive' },
          status: { in: PAID_STATUSES },
        },
      });
      if (previous > 0) {
        throw new BadRequestException('Este cupón es solo para tu primera compra.');
      }
    }

    return {
      coupon,
      discountCents: result.discountCents,
      freeShipping: result.freeShipping,
      customerKey,
    };
  }

  /** Selects one eligible automatic discount. Codes always take precedence at checkout. */
  async automaticQuote(
    db: Db,
    tenantId: string,
    input: { lines: CouponLine[]; email?: string | null },
    options: { lock?: boolean } = {},
  ): Promise<CouponQuote | null> {
    const candidates = await db.coupon.findMany({
      where: { tenantId, method: CouponMethod.AUTOMATIC, isActive: true },
      orderBy: [{ createdAt: 'asc' }],
      take: 100,
    });
    const eligible = candidates
      .map((coupon) => ({ coupon, result: evaluateCoupon(coupon, input.lines) }))
      .filter((row): row is { coupon: Coupon; result: Extract<ReturnType<typeof evaluateCoupon>, { ok: true }> } => row.result.ok)
      .sort((a, b) => b.result.discountCents - a.result.discountCents);

    for (const { coupon } of eligible) {
      try {
        return await this.quote(
          db,
          tenantId,
          { code: coupon.code, lines: input.lines, email: input.email },
          { ...options, method: CouponMethod.AUTOMATIC },
        );
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
      }
    }
    return null;
  }

  private async getById(tenantId: string, id: string) {
    const coupon = await this.prisma.coupon.findFirst({ where: { id, tenantId } });
    if (!coupon) throw new NotFoundException('Cupón no encontrado.');
    return coupon;
  }

  private toData(dto: UpdateCouponDto) {
    const data: Partial<Omit<Coupon, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>> = {};
    if (dto.code !== undefined) data.code = normalizeCouponCode(dto.code);
    if (dto.method !== undefined) data.method = dto.method;
    if (dto.label !== undefined) data.label = dto.label.trim();
    if (dto.note !== undefined) data.note = dto.note?.trim() || null;
    if (dto.kind !== undefined) data.kind = dto.kind;
    if (dto.value !== undefined) data.value = dto.value;
    if (dto.maxDiscountCents !== undefined) data.maxDiscountCents = dto.maxDiscountCents;
    if (dto.buyQuantity !== undefined) data.buyQuantity = dto.buyQuantity;
    if (dto.getQuantity !== undefined) data.getQuantity = dto.getQuantity;
    if (dto.maxApplications !== undefined) data.maxApplications = dto.maxApplications;
    if (dto.minSubtotalCents !== undefined) data.minSubtotalCents = dto.minSubtotalCents;
    if (dto.minItems !== undefined) data.minItems = dto.minItems;
    if (dto.scope !== undefined) data.scope = dto.scope;
    if (dto.targets !== undefined) {
      data.targets = [...new Set(dto.targets.map((t) => t.trim()).filter(Boolean))];
    }
    if (dto.startsAt !== undefined) data.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    if (dto.endsAt !== undefined) data.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (dto.usageLimit !== undefined) data.usageLimit = dto.usageLimit;
    if (dto.perCustomerLimit !== undefined) data.perCustomerLimit = dto.perCustomerLimit;
    if (dto.firstOrderOnly !== undefined) data.firstOrderOnly = dto.firstOrderOnly;
    if (dto.applyToSets !== undefined) data.applyToSets = dto.applyToSets;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return data as Omit<Coupon, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>;
  }

  private assertRules(data: Parameters<typeof couponRuleError>[0]) {
    const error = couponRuleError({
      kind: data.kind,
      value: data.value,
      maxDiscountCents: data.maxDiscountCents ?? null,
      buyQuantity: data.buyQuantity ?? null,
      getQuantity: data.getQuantity ?? null,
      maxApplications: data.maxApplications ?? null,
      scope: data.scope ?? 'ALL',
      targets: data.targets ?? [],
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
    });
    if (error) throw new BadRequestException(error);
  }

  private mapConflict(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('Ya existe un cupón con ese código.');
    }
    if (error instanceof Prisma.PrismaClientUnknownRequestError) {
      return new BadRequestException('Revisa las reglas del cupón.');
    }
    return error;
  }

  private automaticCode(): string {
    return `AUTO-${randomBytes(6).toString('hex').toUpperCase()}`;
  }
}
