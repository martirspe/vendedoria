import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { StoreRecommendations } from '@vendedoria/contracts';
import { PrismaService } from '../prisma/prisma.service';
import {
  PRODUCT_INCLUDE,
  StoreAccess,
} from '../storefront/storefront-public.service';
import { toProductCard } from '../storefront/storefront-mapper';
import { BehaviorEventDto, RecommendationQueryDto } from './dto/conversion.dto';
import { ConversionInfrastructure } from './conversion-infrastructure.service';
import { RecommendationVectors } from './recommendation-vector.service';
import { sessionHash } from './recovery-token';

type Ranked = {
  handle: string;
  reason: 'bought-together' | 'category-affinity' | 'upgrade';
};
@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly infra: ConversionInfrastructure,
    private readonly vectors: RecommendationVectors,
  ) {}
  private hash(tenantId: string, sessionId: string) {
    return sessionHash(
      this.infra.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      tenantId,
      sessionId,
    );
  }
  async record(
    access: StoreAccess,
    dto: BehaviorEventDto,
  ): Promise<{ recorded: boolean }> {
    if (access.isPreview) return { recorded: false };
    const product = await this.prisma.product.findFirst({
      where: {
        tenantId: access.tenantId,
        handle: dto.handle,
        isPublishedOnStore: true,
      },
      select: { handle: true },
    });
    if (!product) return { recorded: false };
    const hash = this.hash(access.tenantId, dto.sessionId);
    const total = await this.prisma.storeBehaviorEvent.count({
      where: { tenantId: access.tenantId, sessionHash: hash },
    });
    if (total >= 300) return { recorded: false };
    // Deduplicate repeated renders and cap retained history per anonymous session.
    const recent = await this.prisma.storeBehaviorEvent.findFirst({
      where: {
        tenantId: access.tenantId,
        sessionHash: hash,
        handle: dto.handle,
        kind: dto.kind,
        createdAt: { gt: new Date(Date.now() - 60_000) },
      },
    });
    if (!recent)
      await this.prisma.storeBehaviorEvent.create({
        data: {
          tenantId: access.tenantId,
          sessionHash: hash,
          handle: dto.handle,
          kind: dto.kind,
        },
      });
    return { recorded: true };
  }
  async forget(tenantId: string, sessionId: string) {
    await this.prisma.storeBehaviorEvent.deleteMany({
      where: { tenantId, sessionHash: this.hash(tenantId, sessionId) },
    });
    return { forgotten: true };
  }
  async recommend(
    access: StoreAccess,
    query: RecommendationQueryDto,
  ): Promise<StoreRecommendations> {
    const tenantId = access.tenantId;
    const currentHandles = [...new Set(query.handles ?? [])];
    const events =
      query.sessionId && !access.isPreview
        ? await this.prisma.storeBehaviorEvent.findMany({
            where: {
              tenantId,
              sessionHash: this.hash(tenantId, query.sessionId),
              createdAt: { gt: new Date(Date.now() - 7 * 86400_000) },
            },
            orderBy: { createdAt: 'desc' },
            take: 30,
            select: { handle: true, kind: true },
          })
        : [];
    const seedHandles = [
      ...new Set([...currentHandles, ...events.map((e) => e.handle)]),
    ];
    if (!seedHandles.length) return { items: [] };
    const key = createHash('sha256')
      .update(JSON.stringify([currentHandles.sort(), events]))
      .digest('hex');
    const ranked = await this.infra.cached<Ranked[]>(
      `conversion-rank/${tenantId}/${key}`,
      async () => {
        const seeds = await this.prisma.product.findMany({
          where: {
            tenantId,
            handle: { in: seedHandles },
            isPublishedOnStore: true,
          },
          select: {
            id: true,
            handle: true,
            categories: true,
            brand: true,
            line: true,
            basePriceCents: true,
          },
        });
        if (!seeds.length) return [];
        const current = seeds.filter((p) => currentHandles.includes(p.handle));
        const ids = current.map((p) => p.id);
        const pairs = ids.length
          ? await this.prisma.$queryRaw<
              Array<{ handle: string; count: bigint }>
            >(Prisma.sql`
        SELECT p.handle, COUNT(DISTINCT o.id) AS count
        FROM "Order" o JOIN "OrderItem" i ON i."orderId" = o.id JOIN "Product" p ON p.id = i."productId"
        WHERE o."tenantId" = ${tenantId} AND p."tenantId" = ${tenantId} AND p."isPublishedOnStore" = true
          AND o.status IN ('PAID', 'FULFILLING', 'SHIPPED', 'COMPLETED') AND o."createdAt" > NOW() - INTERVAL '90 days'
          AND EXISTS (SELECT 1 FROM "OrderItem" seed WHERE seed."orderId" = o.id AND seed."productId" IN (${Prisma.join(ids)}))
        GROUP BY p.handle ORDER BY count DESC, p.handle LIMIT 80
      `)
          : [];
        const categories = [...new Set(seeds.flatMap((p) => p.categories))];
        const vectorHandles = await this.vectors.rank(tenantId, seeds);
        const candidates = await this.prisma.product.findMany({
          where: {
            tenantId,
            isPublishedOnStore: true,
            isAvailable: true,
            handle: { notIn: currentHandles },
            OR: [
              {
                handle: {
                  in: [...pairs.map((p) => p.handle), ...vectorHandles],
                },
              },
              ...(categories.length
                ? [{ categories: { hasSome: categories } }]
                : []),
            ],
          },
          take: 200,
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          select: {
            handle: true,
            categories: true,
            line: true,
            brand: true,
            basePriceCents: true,
            components: { select: { componentId: true } },
          },
        });
        return candidates
          .map((p) => {
            const pair = pairs.find((pair) => pair.handle === p.handle);
            const upgrade = current.some(
              (seed) =>
                p.basePriceCents > seed.basePriceCents &&
                p.basePriceCents <= seed.basePriceCents * 2 &&
                ((p.line && p.line === seed.line && p.brand === seed.brand) ||
                  p.components.some((c) => c.componentId === seed.id)),
            );
            const affinity = seeds.reduce(
              (sum, seed) =>
                sum +
                p.categories.filter((c) => seed.categories.includes(c)).length *
                  (currentHandles.includes(seed.handle) ? 2 : 1),
              0,
            );
            return {
              handle: p.handle,
              score:
                Number(pair?.count ?? 0) * 20 +
                affinity +
                (upgrade ? 3 : 0) +
                (vectorHandles.includes(p.handle) ? 2 : 0),
              reason: pair
                ? ('bought-together' as const)
                : upgrade
                  ? ('upgrade' as const)
                  : ('category-affinity' as const),
            };
          })
          .filter((p) => p.score > 0)
          .sort((a, b) => b.score - a.score || a.handle.localeCompare(b.handle))
          .slice(0, 20)
          .map(({ handle, reason }) => ({ handle, reason }));
      },
    );
    // Cache only rankings: prices, variants, stock, set pieces and visibility always come from PostgreSQL.
    const records = ranked.length
      ? await this.prisma.product.findMany({
          where: {
            tenantId,
            handle: { in: ranked.map((r) => r.handle) },
            isPublishedOnStore: true,
          },
          include: PRODUCT_INCLUDE,
        })
      : [];
    const items = ranked.flatMap((rank) => {
      const record = records.find((p) => p.handle === rank.handle);
      if (!record || currentHandles.includes(record.handle)) return [];
      const product = toProductCard(record);
      return product.isAvailable ? [{ product, reason: rank.reason }] : [];
    });
    return { items: items.slice(0, query.context === 'checkout' ? 1 : 4) };
  }
}
