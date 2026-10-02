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
  shipping: StorefrontShipping;
  legal: StorefrontLegal;
  checkout: StorefrontCheckout;
  industry: string;
  template: StoreTemplate;
  /** Template texts chosen by the merchant; missing fields use the template defaults. */
  templateCopy: StoreTemplateCopy;
};

export type StoreTemplate = 'classic' | 'selecta';

export type StoreTemplateFaq = { question: string; answer: string };

export type StoreTemplateCopy = {
  heroEyebrow?: string;
  heroTitle?: string;
  heroEmphasis?: string;
  heroText?: string;
  heroNote?: string;
  bannerEyebrow?: string;
  bannerTitle?: string;
  bannerText?: string;
  bannerImageUrl?: string;
  closingPhrase?: string;
  footerNote?: string;
  faq?: StoreTemplateFaq[];
};

/** LIMA/PROVINCE are flat zone rates; OLVA/SHALOM are courier rates by distance. */
export type ShippingMode = 'LIMA' | 'PROVINCE' | 'OLVA' | 'SHALOM' | 'PICKUP';

export type ShippingOption = {
  mode: ShippingMode;
  label: string;
  /** Base price before the free shipping threshold or coupons; the lowest tier for couriers. */
  cents: number;
  /** Delivery estimate, or the pickup address for PICKUP. */
  eta: string | null;
  /** Courier rate: the real price comes from the shipping quote of the district. */
  byDistance: boolean;
};

/** Reference courier rate for a district; the buyer must accept it at checkout. */
export type ShippingQuote = {
  mode: 'OLVA' | 'SHALOM';
  label: string;
  cents: number;
  distanceKm: number | null;
};

export type StorefrontShipping = {
  options: ShippingOption[];
  freeShippingFromCents: number | null;
  /** District and department orders ship from, e.g. "San Juan de Lurigancho, Lima". */
  origin: string | null;
};

export type StorefrontLegal = {
  legalName: string | null;
  ruc: string | null;
  legalAddress: string | null;
  complaintsBookUrl: string | null;
  dataBankCode: string | null;
  /** 0 = only legal guarantee (defects); otherwise days to request an exchange. */
  exchangeDays: number;
  /** Last change to the store settings the legal pages are generated from. */
  updatedAt: string;
};

export type StorefrontCheckout = {
  /** `online`: card and Yape on the site. `whatsapp`: the order is sent through WhatsApp. */
  mode: 'online' | 'whatsapp';
  /** Mercado Pago public key of the merchant when `mode` is `online`. */
  publicKey: string | null;
  liveMode: boolean;
  /** Development only: online checkout without credentials, paid with a simulated payment. */
  simulator: boolean;
  /** True when the store has at least one active coupon. */
  couponsEnabled: boolean;
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

export type PublicMedia = {
  url: string;
  alt: string | null;
  caption: string | null;
  /** `related`: ambient photo shown with the product details, not in the gallery. */
  kind: 'image' | 'related';
};

export type PublicProductDetails = {
  size: string | null;
  benefits: string[];
  usage: string[];
  notes: string[];
  highlights: string[];
  family: string | null;
  intensity: string | null;
  scent: Array<{ name: string; description: string }>;
  /** Show the gallery photos together as one composition. */
  montage: boolean;
};

/** Piece of a set (or the product itself when it is sold alone). */
export type PublicSetPiece = {
  /** Handle of the piece when it is also sold alone. */
  handle: string | null;
  name: string;
  size: string | null;
  code: string | null;
  details: string[];
  quantity: number;
};

/** Full product used by templates that browse the whole catalog in the browser. */
export type StoreCatalogProduct = PublicProductCard & {
  descriptionFull: string | null;
  line: string | null;
  lineKey: string | null;
  format: 'individual' | 'set';
  /** Units left when 20 or fewer are tracked; null means plenty or unlimited. */
  stockLeft: number | null;
  media: PublicMedia[];
  variants: PublicVariant[];
  details: PublicProductDetails;
  includes: PublicSetPiece[];
  seoTitle: string | null;
  seoDescription: string | null;
};

export type PublicProductSort = 'featured' | 'newest' | 'price-asc' | 'price-desc';

export type PublicProductList = {
  items: PublicProductCard[];
  total: number;
  page: number;
  pageSize: number;
};

export type CheckoutItemInput = {
  handle: string;
  variantId?: string;
  quantity: number;
};

export type CouponPreviewResult = {
  code: string;
  label: string;
  discountCents: number;
  freeShipping: boolean;
};

export type CheckoutRequest = {
  checkoutKey: string;
  items: CheckoutItemInput[];
  customer: { name: string; email: string; phone: string; document?: string };
  delivery: {
    mode: ShippingMode;
    /** INEI district code; required for LIMA and PROVINCE and must belong to that zone. */
    ubigeo?: string;
    address?: string;
    reference?: string;
    /** Required for OLVA/SHALOM: the buyer accepts the reference rate. */
    acknowledgeRate?: boolean;
  };
  couponCode?: string;
  acceptTerms: true;
};

/** Peruvian district (INEI ubigeo). Lima Metropolitana and Callao ship at the LIMA rate. */
export type UbigeoDistrict = {
  code: string;
  department: string;
  province: string;
  district: string;
};

export type PublicOrderStatus = 'PENDING_PAYMENT' | 'PAID' | 'FULFILLING' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED';

export type PublicOrderItem = {
  title: string;
  handle: string | null;
  quantity: number;
  unitCents: number;
  totalCents: number;
};

export type PublicOrder = {
  id: string;
  code: string;
  /** Capability token: required to read, pay or cancel the order. */
  token: string;
  status: PublicOrderStatus;
  /** `processing` while a payment is in flight, `rejected` after a declined attempt. */
  paymentState: string | null;
  paymentDetail: string | null;
  currency: string;
  items: PublicOrderItem[];
  subtotalCents: number;
  discountCents: number;
  couponCode: string | null;
  shippingCents: number;
  totalCents: number;
  customer: { name: string; email: string; phone: string };
  delivery: { mode: ShippingMode; label: string; address: string | null; eta: string | null };
  /** Courier tracking code once the order ships. */
  trackingCode: string | null;
  expiresAt: string | null;
  cancelReason: string | null;
  createdAt: string;
};

export type PayOrderRequest = {
  token: string;
  paymentKey: string;
  method: 'card' | 'yape';
  cardToken: string;
  paymentMethodId?: string;
  paymentType?: string;
  phone?: string;
  identificationType?: 'DNI' | 'CE';
  identificationNumber?: string;
};

export type SitemapEntry = {
  handle: string;
  updatedAt: string;
};
