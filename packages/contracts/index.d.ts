/**
 * Public storefront API contracts shared by the API and the store app.
 * Type-only: this file must never contain runtime code.
 */

export type StorefrontStatus = 'DRAFT' | 'PUBLISHED' | 'SUSPENDED';

export type StoreResolveResult = {
  slug: string;
};

export type StorefrontView = {
  slug: string;
  displayName: string;
  tagline: string | null;
  logoUrl: string | null;
  heroImageUrl: string | null;
  brandColor: string;
  accentColor: string;
  whatsappPhone: string | null;
  contactEmail: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  country: string;
  currency: string;
  categories: string[];
  status: StorefrontStatus;
  isPreview: boolean;
  showPlatformBadge: boolean;
};

export type PublicProductCard = {
  handle: string;
  name: string;
  descriptionShort: string | null;
  brand: string | null;
  categories: string[];
  currency: string;
  priceCents: number;
  /** True when variants have different prices; `priceCents` is then the lowest. */
  priceVaries: boolean;
  compareAtPriceCents: number | null;
  imageUrl: string | null;
  isAvailable: boolean;
  hasVariants: boolean;
};

export type PublicVariantOption = {
  name: string;
  value: string;
};

export type PublicVariant = {
  id: string;
  label: string;
  options: PublicVariantOption[];
  priceCents: number;
  isAvailable: boolean;
  imageUrl: string | null;
};

export type PublicProductDetail = PublicProductCard & {
  descriptionFull: string | null;
  media: string[];
  variants: PublicVariant[];
  seoTitle: string | null;
  seoDescription: string | null;
  related: PublicProductCard[];
};

export type PublicProductSort = 'featured' | 'newest' | 'price-asc' | 'price-desc';

export type PublicProductList = {
  items: PublicProductCard[];
  total: number;
  page: number;
  pageSize: number;
};

export type SitemapEntry = {
  handle: string;
  updatedAt: string;
};
