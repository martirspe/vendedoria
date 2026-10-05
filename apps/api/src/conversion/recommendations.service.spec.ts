import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ConversionInfrastructure } from './conversion-infrastructure.service';
import {
  affinityVector,
  RecommendationVectors,
} from './recommendation-vector.service';
import { RecommendationsService } from './recommendations.service';

describe('RecommendationsService', () => {
  it('hydrates cached rankings with tenant-scoped current availability and price', async () => {
    const product = (handle: string, isAvailable = true) => ({
      handle,
      name: handle,
      isAvailable,
      categories: ['Shoes'],
      basePriceCents: 2500,
      compareAtPriceCents: null,
      currency: 'PEN',
      stockUnlimited: true,
      stockQty: null,
      variants: [],
      media: [],
      components: [],
    });
    const prisma = {
      product: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            product('current-price'),
            product('gone', false),
          ]),
      },
      storeBehaviorEvent: { findMany: jest.fn() },
    };
    const infra = {
      config: new ConfigService({ JWT_ACCESS_SECRET: 'a'.repeat(32) }),
      cached: jest.fn().mockResolvedValue([
        { handle: 'current-price', reason: 'bought-together' },
        { handle: 'gone', reason: 'upgrade' },
      ]),
    };
    const service = new RecommendationsService(
      prisma as unknown as PrismaService,
      infra as unknown as ConversionInfrastructure,
      {} as RecommendationVectors,
    );
    const result = await service.recommend(
      { tenantId: 'tenant-a', isPreview: false },
      { handles: ['seed'], context: 'checkout' },
    );
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          isPublishedOnStore: true,
        }),
      }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].product.priceCents).toBe(2500);
    expect(prisma.storeBehaviorEvent.findMany).not.toHaveBeenCalled();
  });
  it('does not query behavior for anonymous requests without explicit session input', async () => {
    const prisma = { storeBehaviorEvent: { findMany: jest.fn() } };
    const service = new RecommendationsService(
      prisma as unknown as PrismaService,
      { config: new ConfigService() } as ConversionInfrastructure,
      {} as RecommendationVectors,
    );
    expect(
      await service.recommend({ tenantId: 'tenant-a', isPreview: false }, {}),
    ).toEqual({ items: [] });
    expect(prisma.storeBehaviorEvent.findMany).not.toHaveBeenCalled();
  });
  it('uses deterministic normalized vectors derived from actual catalog features', () => {
    const vector = affinityVector([
      { handle: 'shoe', categories: ['Calzado'], brand: 'Store' },
    ]);
    expect(vector).toHaveLength(128);
    expect(vector.reduce((sum, n) => sum + n * n, 0)).toBeCloseTo(1);
    expect(vector).toEqual(
      affinityVector([
        { handle: 'shoe', categories: ['Calzado'], brand: 'Store' },
      ]),
    );
  });
});
