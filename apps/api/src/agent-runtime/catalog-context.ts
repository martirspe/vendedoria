import type { CatalogProductView } from './sales-agent-tools.service';

export const CATALOG_CONTEXT_CHARS = 16_000;
const CRITICAL_FACTS = new Set([
  'requirements', 'exclusions', 'compatibility', 'warranty', 'coverage', 'cancellation',
  'returns', 'license', 'accessDuration', 'digitalFormat',
]);

/** Select useful facts, preserving conditions in full rather than slicing arbitrary text. */
export function catalogContext(products: CatalogProductView[], query: string) {
  const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const words = normalize(query).split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2);
  const relevance = (text: string) => words.filter((word) => normalize(text).includes(word)).length;
  const catalog: Array<Record<string, unknown>> = [];
  for (const product of products.slice(0, 3)) {
    const facts = Object.fromEntries(Object.entries(product.facts ?? {}).map(([key, value]) => [
      key, CRITICAL_FACTS.has(key) || !Array.isArray(value) ? value
        : [...value].sort((a, b) => relevance(b) - relevance(a)).slice(0, key === 'faqs' ? 2 : 4),
    ]));
    const variants = [...product.variants].sort((a, b) => relevance(b.label) - relevance(a.label));
    const entry: Record<string, unknown> = {
      name: product.name, type: product.isService ? 'servicio' : product.isDigital ? 'digital' : 'producto',
      category: product.categories, description: product.descriptionShort,
      fullDescription: product.descriptionFull, facts, price: product.priceLabel,
      regularPrice: product.compareAtPriceLabel, stock: product.stockLabel, url: product.productUrl,
      variants: variants.slice(0, 12).map((variant) => ({ label: variant.label, price: variant.priceLabel, stock: variant.stockLabel, available: variant.isAvailable })),
      moreVariants: variants.length > 12,
    };
    if (JSON.stringify([...catalog, entry]).length > CATALOG_CONTEXT_CHARS) {
      delete entry.fullDescription;
      entry.facts = Object.fromEntries(Object.entries(facts).filter(([key]) => CRITICAL_FACTS.has(key)));
      entry.detailsOmitted = true;
    }
    if (JSON.stringify([...catalog, entry]).length > CATALOG_CONTEXT_CHARS) break;
    catalog.push(entry);
  }
  return catalog;
}

/** History is bounded independently of the catalog size; do not cut messages in half. */
export function promptHistory<T extends { text: string }>(history: T[]): T[] {
  const selected: T[] = [];
  let chars = 0;
  for (const turn of [...history].reverse().slice(0, 12)) {
    if (chars + turn.text.length > 8_000) break;
    selected.unshift(turn);
    chars += turn.text.length;
  }
  return selected;
}
