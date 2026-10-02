import type {
  PublicProductCard,
  PublicProductDetail,
  PublicVariant,
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
  variants: VariantRecord[];
  media: Array<{ url: string; sortOrder: number }>;
};

function productHasStock(product: StoreProductRecord): boolean {
  return product.stockUnlimited || (product.stockQty ?? 0) > 0;
}

/** A variant without its own stock count follows the product stock. */
function variantIsAvailable(
  product: StoreProductRecord,
  variant: VariantRecord,
): boolean {
  if (!product.isAvailable || !variant.isAvailable) {
    return false;
  }
  return variant.stockQty === null ? productHasStock(product) : variant.stockQty > 0;
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

function sortedMedia(product: StoreProductRecord): string[] {
  return [...product.media]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => item.url);
}

export function toProductCard(product: StoreProductRecord): PublicProductCard {
  const variants = product.variants.map((variant) => toVariant(product, variant));
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
    imageUrl: media[0] ?? variants.find((variant) => variant.imageUrl)?.imageUrl ?? null,
    isAvailable,
    hasVariants: variants.length > 0,
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
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    related: related.map(toProductCard),
  };
}
