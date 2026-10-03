import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type {
  PublicProductDetail,
  PublicProductList,
  PublicProductSort,
  SitemapEntry,
  StoreCatalogProduct,
  StoreResolveResult,
  StorefrontCheckout,
  StorefrontView,
} from '@vendedoria/contracts';
import { resolvePlanState } from '../billing/plan-catalog';
import { normalizeDomain } from '../integrations/custom-domain.service';
import { activeCustomDomain, isIntegrationActive } from '../integrations/integration-state';
import { MerchantAccountsService } from '../payments/merchant-accounts.service';
import { PrismaService } from '../prisma/prisma.service';
import { TurnstileService } from '../turnstile/turnstile.service';
import { shippingOptions } from './shipping';
import {
  DEFAULT_STOREFRONT_URL_TEMPLATE,
  isValidStoreSlug,
  slugFromHost,
  storefrontBaseDomain,
} from './storefront-host';
import { toCatalogProduct, toProductCard, toProductDetail } from './storefront-mapper';
import { verifyPreviewToken } from './storefront-preview';
import { effectiveTemplate, readTemplateCopy } from './store-templates';
import { findUbigeo } from '../ubigeo/ubigeo';

/** "San Juan de Lurigancho, Lima": where orders ship from, for buyer-facing copy. */
function shippingOrigin(ubigeo: string | null): string | null {
  const place = ubigeo ? findUbigeo(ubigeo) : undefined;
  return place ? `${place.district}, ${place.department}` : null;
}

const PRODUCT_INCLUDE = {
  variants: { orderBy: { id: 'asc' } },
  media: { orderBy: { sortOrder: 'asc' } },
  components: {
    orderBy: { id: 'asc' },
    select: {
      quantity: true,
      component: {
        select: {
          handle: true,
          name: true,
          sku: true,
          details: true,
          isAvailable: true,
          isPublishedOnStore: true,
          stockUnlimited: true,
          stockQty: true,
        },
      },
    },
  },
} satisfies Prisma.ProductInclude;

const MAX_PAGE_SIZE = 48;
const MAX_CATALOG = 500;
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
    private readonly accounts: MerchantAccountsService,
    private readonly turnstile: TurnstileService,
  ) {
    this.baseDomain = storefrontBaseDomain(
      this.config.get<string>('STOREFRONT_URL_TEMPLATE') ??
        DEFAULT_STOREFRONT_URL_TEMPLATE,
    );
  }

  async resolveHost(host: string): Promise<StoreResolveResult> {
    const slug = slugFromHost(host, this.baseDomain);
    if (!slug) {
      return this.resolveCustomDomain(host);
    }
    const tenant = await this.tenantBySlug(slug, {
      id: true,
      slug: true,
      storefront: { select: { status: true } },
    });
    const status = tenant?.storefront?.status;
    if (!tenant || !status || status === 'SUSPENDED' || !(await this.storeEnabled(tenant.id))) {
      throw new NotFoundException('Store not found');
    }
    return {
      slug: tenant.slug,
      moved: tenant.slug !== slug,
      primaryHost: await activeCustomDomain(this.prisma, tenant.id),
    };
  }

  /** Own domains only answer once verified and while the plan includes them. */
  private async resolveCustomDomain(host: string): Promise<StoreResolveResult> {
    const domain = normalizeDomain(host);
    const storefront = domain
      ? await this.prisma.storefront.findUnique({
          where: { customDomain: domain },
          select: { tenantId: true, status: true, customDomainStatus: true, tenant: { select: { slug: true } } },
        })
      : null;
    if (
      !storefront ||
      storefront.status === 'SUSPENDED' ||
      storefront.customDomainStatus !== 'active' ||
      !(await this.storeEnabled(storefront.tenantId)) ||
      !(await isIntegrationActive(this.prisma, storefront.tenantId, 'custom_domain'))
    ) {
      throw new NotFoundException('Store not found');
    }
    return { slug: storefront.tenant.slug, moved: false, primaryHost: domain };
  }

  /** Current tenant for a slug, following the redirect left behind when a store changed subdomain. */
  private async tenantBySlug<S extends Prisma.TenantSelect>(slug: string, select: S) {
    const current = await this.prisma.tenant.findUnique({ where: { slug }, select });
    if (current) return current;
    const redirect = await this.prisma.storeSlugRedirect.findUnique({
      where: { slug },
      select: { tenant: { select } },
    });
    return redirect?.tenant ?? null;
  }

  /** The business turned the store on in Integraciones; otherwise it does not exist publicly. */
  private storeEnabled(tenantId: string): Promise<boolean> {
    return isIntegrationActive(this.prisma, tenantId, 'store');
  }

  /**
   * Every public read goes through here: the tenant is derived from the slug
   * on the server and unpublished stores are only visible with a valid preview token.
   */
  async access(slug: string, previewToken?: string): Promise<StoreAccess> {
    if (!isValidStoreSlug(slug)) {
      throw new NotFoundException('Store not found');
    }
    const tenant = await this.tenantBySlug(slug, { id: true, storefront: { select: { status: true } } });
    const status = tenant?.storefront?.status;
    if (!tenant || !status || status === 'SUSPENDED' || !(await this.storeEnabled(tenant.id))) {
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
      showPlatformBadge: resolvePlanState(tenant).platformBadge,
      shipping: {
        options: shippingOptions(storefront),
        freeShippingFromCents: storefront.freeShippingFromCents,
        origin: shippingOrigin(storefront.shippingOriginUbigeo),
      },
      legal: {
        legalName: storefront.legalName,
        ruc: storefront.ruc,
        legalAddress: storefront.legalAddress,
        complaintsBookUrl: storefront.complaintsBookUrl,
        dataBankCode: storefront.dataBankCode,
        exchangeDays: storefront.exchangeDays,
        updatedAt: storefront.updatedAt.toISOString(),
      },
      checkout: await this.checkout(access.tenantId),
      industry: storefront.industry,
      template: effectiveTemplate(storefront.template, storefront.industry),
      templateCopy: readTemplateCopy(storefront.templateCopy),
      tracking:
        !access.isPreview &&
        (storefront.metaPixelId || storefront.ga4MeasurementId) &&
        (await isIntegrationActive(this.prisma, access.tenantId, 'tracking'))
          ? { metaPixelId: storefront.metaPixelId, ga4MeasurementId: storefront.ga4MeasurementId }
          : null,
    };
  }

  /** Whole published catalog for templates that filter and recommend in the browser. */
  async catalog(access: StoreAccess): Promise<StoreCatalogProduct[]> {
    const products = await this.prisma.product.findMany({
      where: { tenantId: access.tenantId, isPublishedOnStore: true },
      include: PRODUCT_INCLUDE,
      orderBy: this.orderBy('featured'),
      take: MAX_CATALOG,
    });
    return products.map(toCatalogProduct);
  }

  async checkout(tenantId: string): Promise<StorefrontCheckout> {
    const [account, activeCoupons] = await Promise.all([
      this.accounts.publicCheckout(tenantId),
      this.prisma.coupon.count({ where: { tenantId, isActive: true } }),
    ]);
    const simulator = !account && this.accounts.simulatorAllowed();
    return {
      mode: account || simulator ? 'online' : 'whatsapp',
      publicKey: account?.publicKey ?? null,
      liveMode: account?.liveMode ?? false,
      simulator,
      couponsEnabled: activeCoupons > 0,
      turnstileSiteKey: this.turnstile.siteKey,
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
        return [{ isAvailable: 'desc' }, { sortOrder: 'asc' }, { updatedAt: 'desc' }];
    }
  }
}
