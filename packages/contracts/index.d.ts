/**
 * Public storefront API contracts shared by the API and the store app.
 * Type-only: this file must never contain runtime code.
 */

export type StorefrontStatus = 'DRAFT' | 'PUBLISHED' | 'SUSPENDED';

export type StoreResolveResult = {
  /** Current slug of the store. */
  slug: string;
  /** The host used a former subdomain of this store: the store server redirects it to `slug`. */
  moved: boolean;
  /** Verified own domain of the store: the store server redirects its subdomain there. */
  primaryHost: string | null;
};

/** Analytics ids of the store, loaded only after the buyer accepts cookies. */
export type StoreTracking = {
  metaPixelId: string | null;
  ga4MeasurementId: string | null;
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
  /** Kinds present in the published catalog (products, services...), for navigation and filters. */
  kinds: ProductKind[];
  status: StorefrontStatus;
  isPreview: boolean;
  showPlatformBadge: boolean;
  shipping: StorefrontShipping;
  legal: StorefrontLegal;
  checkout: StorefrontCheckout;
  industry: string;
  template: StoreTemplate;
  /** Texts and images edited by the merchant: the published version, or the draft in a preview. */
  templateContent: StoreTemplateContent;
  /** Null when the plan or the merchant has no analytics on. */
  tracking: StoreTracking | null;
};

export type StoreTemplate = 'classic' | 'selecta' | 'stride';

export type StoreTemplateFaq = { question: string; answer: string };

/**
 * Merchant content of a template. A missing field uses the template text; an empty string hides
 * that text or image. Keys are `sections[sectionId][fieldId]`, declared by `StoreEditorSection`.
 */
export type StoreTemplateContent = {
  version: 1;
  sections: Record<string, Record<string, string>>;
  /** Own questions; absent uses the answers built from the store settings. */
  faq?: StoreTemplateFaq[];
  /** Home section order per template; absent uses the template order with every section visible. */
  layouts?: Partial<Record<StoreTemplate, StoreLayoutItem[]>>;
  /** Brand style; a missing key uses the template default. */
  theme?: StoreTemplateTheme;
};

/** `modern`: Manrope · `editorial`: serif titles · `simple`: the device font (fastest). */
export type StoreThemeFont = 'modern' | 'editorial' | 'simple';
export type StoreThemeCorners = 'square' | 'soft' | 'round';

export type StoreTemplateTheme = {
  /** `#rrggbb`: buttons, links and highlights. */
  primary?: string;
  /** `#rrggbb`: secondary highlights (Classic and Impulso). */
  accent?: string;
  font?: StoreThemeFont;
  /** Buttons and fields (Classic). */
  corners?: StoreThemeCorners;
  /** Logo image URL; '' shows the store name. */
  logo?: string;
};

export type StoreThemeOption = keyof StoreTemplateTheme;

/** Style options a template supports and the values it uses when the merchant sets none. */
export type StoreEditorTheme = {
  options: StoreThemeOption[];
  defaults: Required<StoreTemplateTheme>;
};

/**
 * One section of the home page. Built-in sections use their type as id; blocks added from the
 * library use `type-xxxxxx` and keep their texts in `sections[id]`.
 */
export type StoreLayoutItem = { id: string; type: string; hidden?: boolean };

/**
 * `builtin`: part of the template home, once, can be moved (and hidden when `canHide`).
 * `block`: added from the section library, any number of times, can be removed.
 * `fixed`: outside the home body (announcement bar, footer, other pages); only its texts are editable.
 */
export type StoreEditorSectionRole = 'builtin' | 'block' | 'fixed';

/** Store page the editor preview can show. */
export type StoreEditorPage = 'home' | 'product';

export type StoreEditorFieldKind = 'text' | 'multiline' | 'image' | 'choice';

export type StoreEditorChoice = { value: string; label: string };

export type StoreEditorField = {
  /** Field id inside its section; the editable element of the store uses `section.field`. */
  id: string;
  label: string;
  kind: StoreEditorFieldKind;
  /** Characters; 0 for images and choices. */
  maxLength: number;
  /** Design options of a `choice` field; `''` is the template's own look. */
  options?: StoreEditorChoice[];
};

/** Editable part of a template page, in default page order. `id` is the section type. */
export type StoreEditorSection = {
  id: string;
  label: string;
  fields: StoreEditorField[];
  /** The section shows the store FAQ list. */
  faq: boolean;
  role: StoreEditorSectionRole;
  /** False for sections the store cannot work without (the product list). */
  canHide: boolean;
  /** Library description of a block, or what a fixed section is. */
  description?: string;
  /** Page of a fixed section shown on a page other than the home; absent when it is on every page. */
  page?: Exclude<StoreEditorPage, 'home'>;
  /** Initial texts of a newly added block. */
  defaults?: Record<string, string>;
};

/** Effective values the store is showing (merchant content over template defaults). */
export type StoreEditorSnapshot = {
  /** `section.field` → text or image URL; '' when hidden or without image. */
  fields: Record<string, string>;
  faq: StoreTemplateFaq[];
  /** Sections present on the page, in order. */
  sections: string[];
};

/** Messages from the store page shown inside the console editor. */
export type StoreEditorFrameMessage =
  | { source: 'vendedoria-store'; type: 'snapshot'; snapshot: StoreEditorSnapshot }
  | { source: 'vendedoria-store'; type: 'select'; section: string; field: string | null }
  | { source: 'vendedoria-store'; type: 'input'; section: string; field: string; value: string }
  | { source: 'vendedoria-store'; type: 'commit'; section: string; field: string; value: string }
  | { source: 'vendedoria-store'; type: 'image'; section: string; field: string };

/** Messages from the console editor to the store page. */
export type StoreEditorHostMessage =
  | { source: 'vendedoria-editor'; type: 'content'; content: StoreTemplateContent }
  /** `page` opens that page in the preview first when it is not the one showing. */
  | { source: 'vendedoria-editor'; type: 'select'; section: string | null; page?: StoreEditorPage };

/** Home delivery is priced by ubigeo: OLVA/SHALOM courier rates by distance from the store origin. */
export type ShippingMode = 'OLVA' | 'SHALOM' | 'PICKUP';

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
  /** INDIVIDUAL sells without RUC: `ruc` is null and `legalAddress` is only "district, province". */
  sellerType: 'BUSINESS' | 'INDIVIDUAL';
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
  /** Cloudflare Turnstile site key; when set, `POST checkout` needs a token (action `checkout`) in `X-Turnstile-Token`. */
  turnstileSiteKey: string | null;
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
  /** `SERVICE`: booked and paid, never shipped and without stock. `DIGITAL`: delivered by access link once paid. */
  kind: ProductKind;
  /** Only for services. */
  service: PublicServiceInfo | null;
};

export type ProductKind = 'PRODUCT' | 'SERVICE' | 'DIGITAL';

/** Where a service takes place: at the business, at the buyer's home or online. */
export type ServiceMode = 'onsite' | 'home' | 'online';

export type PublicServiceInfo = {
  /** Approximate length in minutes. */
  durationMinutes: number | null;
  mode: ServiceMode | null;
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
  details: PublicProductDetails;
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
  useCases: string[];
  exclusions: string[];
  compatibility: string[];
  returns: string | null;
  digitalFormat: string | null;
  license: string | null;
  accessDuration: string | null;
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
  /** Specifications as name/value pairs. */
  attributes: Array<{ name: string; value: string }>;
  /** Who it is for. */
  audience: string | null;
  /** What comes in the box or the service. */
  contents: string[];
  warranty: string | null;
  faqs: Array<{ question: string; answer: string }>;
  /** Services: what the buyer must do or bring. */
  requirements: string[];
  /** Services: area covered. */
  coverage: string | null;
  /** Services: rescheduling and cancellation policy. */
  cancellation: string | null;
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
  /** Omitted when the cart has only services. */
  delivery?: {
    mode: ShippingMode;
    /** INEI district code; required for home delivery, it prices the courier rate. */
    ubigeo?: string;
    address?: string;
    reference?: string;
    /** Required for OLVA/SHALOM: the buyer accepts the reference rate. */
    acknowledgeRate?: boolean;
  };
  /** Buyer's preferred date for the services; the business confirms it later. */
  serviceNote?: string;
  couponCode?: string;
  acceptTerms: true;
};

/** Peruvian district (INEI ubigeo). */
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

export type PublicDigitalAccess = {
  title: string;
  /** Null when the business delivers it by other means. */
  url: string | null;
  instructions: string | null;
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
  /** Null when the order has only services. */
  delivery: { mode: ShippingMode; label: string; address: string | null; eta: string | null } | null;
  serviceNote: string | null;
  /** Kinds of the products in the order, to explain what happens after the payment. */
  kinds: ProductKind[];
  /** Access to the digital products; empty until the order is paid. */
  digitalAccess: PublicDigitalAccess[];
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
