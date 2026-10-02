import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanTier, Prisma } from '@prisma/client';
import type {
  PublicProductDetail,
  PublicProductList,
  PublicProductSort,
  SitemapEntry,
  StoreResolveResult,
  StorefrontView,
} from '@vendedoria/contracts';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_STOREFRONT_URL_TEMPLATE,
  isValidStoreSlug,
  slugFromHost,
  storefrontBaseDomain,
} from './storefront-host';
import { toProductCard, toProductDetail } from './storefront-mapper';
import { verifyPreviewToken } from './storefront-preview';

const PRODUCT_INCLUDE = {
  variants: { orderBy: { id: 'asc' } },
  media: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.ProductInclude;

const MAX_PAGE_SIZE = 48;
const BADGE_PLANS: PlanTier[] = [PlanTier.FREE, PlanTier.STARTER];

export type StoreAccess = {
  tenantId: string;
  isPreview: boolean;
};

export type ProductListQuery = {
  category?: string;
  q?: string;
  sort?: PublicProductSort;
  page?: number;
  pageSize?: number;
};

@Injectable()
export class StorefrontPublicService {
  private readonly baseDomain: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.baseDomain = storefrontBaseDomain(
      this.config.get<string>('STOREFRONT_URL_TEMPLATE') ??
        DEFAULT_STOREFRONT_URL_TEMPLATE,
    );
  }

  async resolveHost(host: string): Promise<StoreResolveResult> {
    const slug = slugFromHost(host, this.baseDomain);
    if (!slug) {
      throw new NotFoundException('Store not found');
    }
    const storefront = await this.prisma.storefront.findFirst({
      where: { tenant: { slug }, status: { not: 'SUSPENDED' } },
      select: { id: true },
    });
    if (!storefront) {
      throw new NotFoundException('Store not found');
    }
    return { slug };
  }

  /**
   * Every public read goes through here: the tenant is derived from the slug
   * on the server and unpublished stores are only visible with a valid preview token.
   */
  async access(slug: string, previewToken?: string): Promise<StoreAccess> {
    if (!isValidStoreSlug(slug)) {
      throw new NotFoundException('Store not found');
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, storefront: { select: { status: true } } },
    });
    const status = tenant?.storefront?.status;
    if (!tenant || !status || status === 'SUSPENDED') {
      throw new NotFoundException('Store not found');
    }
    if (status === 'PUBLISHED') {
      return { tenantId: tenant.id, isPreview: false };
    }
    const secret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    if (verifyPreviewToken(secret, tenant.id, previewToken)) {
      return { tenantId: tenant.id, isPreview: true };
    }
    throw new NotFoundException('Store not found');
  }

  async getStore(access: StoreAccess): Promise<StorefrontView> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: access.tenantId },
      include: { storefront: true },
    });
    const storefront = tenant.storefront;
    if (!storefront) {
      throw new NotFoundException('Store not found');
    }
    return {
      slug: tenant.slug,
      displayName: storefront.displayName,
      tagline: storefront.tagline,
      logoUrl: storefront.logoUrl,
      heroImageUrl: storefront.heroImageUrl,
      brandColor: storefront.brandColor,
      accentColor: storefront.accentColor,
      whatsappPhone: storefront.whatsappPhone,
      contactEmail: storefront.contactEmail,
      seoTitle: storefront.seoTitle,
      seoDescription: storefront.seoDescription,
      country: tenant.country,
      currency: tenant.currency,
      categories: await this.categories(access.tenantId),
      status: storefront.status,
      isPreview: access.isPreview,
      showPlatformBadge: BADGE_PLANS.includes(tenant.planTier),
    };
  }

  async listProducts(
    access: StoreAccess,
    query: ProductListQuery,
  ): Promise<PublicProductList> {
    const pageSize = Math.min(Math.max(query.pageSize ?? 24, 1), MAX_PAGE_SIZE);
    const page = Math.max(query.page ?? 1, 1);
    const search = query.q?.trim().slice(0, 80);
    const where: Prisma.ProductWhereInput = {
      tenantId: access.tenantId,
      isPublishedOnStore: true,
      ...(query.category ? { categories: { has: query.category } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { descriptionShort: { contains: search, mode: 'insensitive' } },
              { brand: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: this.orderBy(query.sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: products.map(toProductCard), total, page, pageSize };
  }

  async getProduct(
    access: StoreAccess,
    handle: string,
  ): Promise<PublicProductDetail> {
    const product = await this.prisma.product.findFirst({
      where: { tenantId: access.tenantId, handle, isPublishedOnStore: true },
      include: PRODUCT_INCLUDE,
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const related = await this.prisma.product.findMany({
      where: {
        tenantId: access.tenantId,
        isPublishedOnStore: true,
        id: { not: product.id },
        ...(product.categories.length
          ? { categories: { hasSome: product.categories } }
          : {}),
      },
      include: PRODUCT_INCLUDE,
      orderBy: this.orderBy('featured'),
      take: 8,
    });
    return toProductDetail(product, related);
  }

  async sitemap(access: StoreAccess): Promise<SitemapEntry[]> {
    const products = await this.prisma.product.findMany({
      where: { tenantId: access.tenantId, isPublishedOnStore: true },
      select: { handle: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    });
    return products.map((product) => ({
      handle: product.handle,
      updatedAt: product.updatedAt.toISOString(),
    }));
  }

  private async categories(tenantId: string): Promise<string[]> {
    const rows = await this.prisma.product.findMany({
      where: { tenantId, isPublishedOnStore: true },
      select: { categories: true },
    });
    const unique = new Set(
      rows.flatMap((row) => row.categories.map((category) => category.trim())),
    );
    unique.delete('');
    return [...unique].sort((a, b) => a.localeCompare(b, 'es'));
  }

  private orderBy(
    sort: PublicProductSort | undefined,
  ): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case 'newest':
        return [{ createdAt: 'desc' }];
      case 'price-asc':
        return [{ basePriceCents: 'asc' }, { name: 'asc' }];
      case 'price-desc':
        return [{ basePriceCents: 'desc' }, { name: 'asc' }];
      default:
        return [{ sortOrder: 'asc' }, { updatedAt: 'desc' }];
    }
  }
}
