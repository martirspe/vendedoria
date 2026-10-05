import type { Prisma } from '@prisma/client';
import type {
  PublicMedia,
  PublicProductCard,
  PublicCatalogCard,
  PublicProductDetail,
  PublicProductDetails,
  PublicSetPiece,
  ProductKind,
  PublicVariant,
  ServiceMode,
  StoreCatalogProduct,
} from '@vendedoria/contracts';

type VariantRecord = {
  id: string;
  option1Name: string | null;
  option1Value: string | null;
  option2Name: string | null;
  option2Value: string | null;
  option3Name: string | null;
  option3Value: string | null;
  priceCents: number;
  isAvailable: boolean;
  stockQty: number | null;
  imageUrl: string | null;
};

type ComponentRecord = {
  quantity: number;
  component: {
    handle: string;
    name: string;
    sku: string | null;
    details: Prisma.JsonValue | null;
    isAvailable: boolean;
    isPublishedOnStore: boolean;
    stockUnlimited: boolean;
    stockQty: number | null;
  };
};

export type StoreProductRecord = {
  handle: string;
  name: string;
  descriptionShort: string | null;
  descriptionFull: string | null;
  brand: string | null;
  categories: string[];
  basePriceCents: number;
  compareAtPriceCents: number | null;
  currency: string;
  isAvailable: boolean;
  stockUnlimited: boolean;
  stockQty: number | null;
  seoTitle: string | null;
  seoDescription: string | null;
  kind?: ProductKind;
  durationMinutes?: number | null;
  serviceMode?: string | null;
  sku?: string | null;
  line?: string | null;
  details?: Prisma.JsonValue | null;
  variants: VariantRecord[];
  media: Array<{
    url: string;
    sortOrder: number;
    kind?: string;
    alt?: string | null;
    caption?: string | null;
  }>;
  components?: ComponentRecord[];
};

/** Stock shown publicly when it is this low (scarcity messages, quantity limits). */
const LOW_STOCK = 20;

/**
 * Units the buyer can take. A set is limited by its scarcest piece; untracked
 * stock is unlimited.
 */
function unitsLeft(product: StoreProductRecord): number {
  const pieces = product.components ?? [];
  if (pieces.length) {
    return Math.min(
      ...pieces.map(({ quantity, component }) =>
        !component.isAvailable
          ? 0
          : component.stockUnlimited || component.stockQty === null
            ? Number.POSITIVE_INFINITY
            : Math.floor(component.stockQty / Math.max(quantity, 1)),
      ),
    );
  }
  if (product.stockUnlimited || product.stockQty === null)
    return Number.POSITIVE_INFINITY;
  return product.stockQty;
}

function productHasStock(product: StoreProductRecord): boolean {
  return unitsLeft(product) > 0;
}

/** A variant without its own stock count follows the product stock. */
function variantIsAvailable(
  product: StoreProductRecord,
  variant: VariantRecord,
): boolean {
  if (!product.isAvailable || !variant.isAvailable) {
    return false;
  }
  return variant.stockQty === null
    ? productHasStock(product)
    : variant.stockQty > 0;
}

function toVariant(
  product: StoreProductRecord,
  variant: VariantRecord,
): PublicVariant {
  const options = [
    [variant.option1Name, variant.option1Value],
    [variant.option2Name, variant.option2Value],
    [variant.option3Name, variant.option3Value],
  ]
    .filter((pair): pair is [string | null, string] => Boolean(pair[1]))
    .map(([name, value]) => ({ name: name?.trim() || 'Opción', value }));
  return {
    id: variant.id,
    label: options.map((option) => option.value).join(' / ') || 'Única',
    options,
    priceCents: variant.priceCents,
    isAvailable: variantIsAvailable(product, variant),
    imageUrl: variant.imageUrl,
  };
}

function galleryMedia(product: StoreProductRecord) {
  return [...product.media]
    .filter((item) => item.kind !== 'related')
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function sortedMedia(product: StoreProductRecord): string[] {
  return galleryMedia(product).map((item) => item.url);
}

export function toProductCard(product: StoreProductRecord): PublicProductCard {
  const variants = product.variants.map((variant) =>
    toVariant(product, variant),
  );
  const prices = variants.length
    ? variants.map((variant) => variant.priceCents)
    : [product.basePriceCents];
  const priceCents = Math.min(...prices);
  const media = sortedMedia(product);
  const isAvailable = variants.length
    ? variants.some((variant) => variant.isAvailable)
    : product.isAvailable && productHasStock(product);
  return {
    handle: product.handle,
    name: product.name,
    descriptionShort: product.descriptionShort,
    brand: product.brand,
    categories: product.categories,
    currency: product.currency,
    priceCents,
    priceVaries: new Set(prices).size > 1,
    compareAtPriceCents:
      product.compareAtPriceCents && product.compareAtPriceCents > priceCents
        ? product.compareAtPriceCents
        : null,
    imageUrl:
      media[0] ??
      variants.find((variant) => variant.imageUrl)?.imageUrl ??
      null,
    isAvailable,
    hasVariants: variants.length > 0,
    kind: product.kind ?? 'PRODUCT',
    service:
      product.kind === 'SERVICE'
        ? {
            durationMinutes: product.durationMinutes ?? null,
            mode:
              SERVICE_MODES.find((mode) => mode === product.serviceMode) ??
              null,
          }
        : null,
  };
}

const SERVICE_MODES: readonly ServiceMode[] = ['onsite', 'home', 'online'];

export function toCatalogCard(product: StoreProductRecord): PublicCatalogCard {
  const card = toProductCard(product);
  const left = unitsLeft(product);
  return {
    ...card,
    secondaryImageUrl: sortedMedia(product).find((url) => url !== card.imageUrl) ?? null,
    variants: product.variants.map((variant) => toVariant(product, variant)),
    stockLeft: !card.hasVariants && card.kind === 'PRODUCT' && Number.isFinite(left) && left <= LOW_STOCK
      ? Math.max(left, 0) : null,
    benefit: readDetails(product.details).benefits[0] ?? null,
  };
}

export function toProductDetail(
  product: StoreProductRecord,
  related: StoreProductRecord[],
): PublicProductDetail {
  return {
    ...toProductCard(product),
    descriptionFull: product.descriptionFull,
    media: sortedMedia(product),
    variants: product.variants.map((variant) => toVariant(product, variant)),
    details: readDetails(product.details),
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    related: related.map(toProductCard),
  };
}

const text = (value: unknown, max = 600): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

const texts = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => text(item, 400))
        .filter((item): item is string => !!item)
        .slice(0, 20)
    : [];

/** Merchant-entered JSON is read defensively: unknown or malformed fields are dropped. */
export function readDetails(
  value: Prisma.JsonValue | null | undefined,
): PublicProductDetails {
  const raw =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const scent = Array.isArray(raw['scent'])
    ? raw['scent'].flatMap((item) => {
        const row = item as Record<string, unknown> | null;
        const name = text(row?.['name'], 80);
        return name
          ? [{ name, description: text(row?.['description'], 300) ?? '' }]
          : [];
      })
    : [];
  const pairs = <A extends string, B extends string>(
    key: string,
    first: A,
    second: B,
    max: number,
    limits: [number, number],
  ) =>
    Array.isArray(raw[key])
      ? (raw[key] as unknown[])
          .flatMap((item) => {
            const row = item as Record<string, unknown> | null;
            const a = text(row?.[first], limits[0]);
            const b = text(row?.[second], limits[1]);
            return a && b ? [{ [first]: a, [second]: b } as Record<A | B, string>] : [];
          })
          .slice(0, max)
      : [];
  return {
    size: text(raw['size'], 60),
    useCases: texts(raw['useCases']),
    exclusions: texts(raw['exclusions']),
    compatibility: texts(raw['compatibility']),
    returns: text(raw['returns'], 300),
    digitalFormat: text(raw['digitalFormat'], 80),
    license: text(raw['license'], 300),
    accessDuration: text(raw['accessDuration'], 200),
    benefits: texts(raw['benefits']),
    usage: texts(raw['usage']),
    notes: texts(raw['notes']),
    highlights: texts(raw['highlights']),
    family: text(raw['family'], 80),
    intensity: text(raw['intensity'], 80),
    scent: scent.slice(0, 6),
    montage: raw['montage'] === true,
    attributes: pairs('attributes', 'name', 'value', 20, [60, 200]),
    audience: text(raw['audience'], 200),
    contents: texts(raw['contents']),
    warranty: text(raw['warranty'], 300),
    faqs: pairs('faqs', 'question', 'answer', 10, [200, 600]),
    requirements: texts(raw['requirements']),
    coverage: text(raw['coverage'], 200),
    cancellation: text(raw['cancellation'], 300),
  };
}

export const lineKey = (line: string | null | undefined): string | null =>
  line
    ? line
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || null
    : null;

function toMedia(product: StoreProductRecord): PublicMedia[] {
  return [...product.media]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => ({
      url: item.url,
      alt: item.alt ?? null,
      caption: item.caption ?? null,
      kind: item.kind === 'related' ? 'related' : 'image',
    }));
}

function toPieces(
  product: StoreProductRecord,
  details: PublicProductDetails,
): PublicSetPiece[] {
  const components = product.components ?? [];
  if (!components.length) {
    return [
      {
        handle: product.handle,
        name: product.name,
        size: details.size,
        code: product.sku ?? null,
        details: details.highlights,
        quantity: 1,
      },
    ];
  }
  return components.map(({ quantity, component }) => {
    const piece = readDetails(component.details);
    return {
      handle: component.isPublishedOnStore ? component.handle : null,
      name: component.name,
      size: piece.size,
      code: component.sku,
      details: piece.highlights,
      quantity,
    };
  });
}

export function toCatalogProduct(
  product: StoreProductRecord,
): StoreCatalogProduct {
  const details = readDetails(product.details);
  const left = unitsLeft(product);
  return {
    ...toProductCard(product),
    descriptionFull: product.descriptionFull,
    line: product.line ?? null,
    lineKey: lineKey(product.line),
    format: product.components?.length ? 'set' : 'individual',
    stockLeft:
      Number.isFinite(left) && left <= LOW_STOCK ? Math.max(left, 0) : null,
    media: toMedia(product),
    variants: product.variants.map((variant) => toVariant(product, variant)),
    details,
    includes: toPieces(product, details),
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
  };
}
