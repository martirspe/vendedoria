import { Injectable, inject, signal } from '@angular/core';
import { ResolveFn } from '@angular/router';
import type { PublicMedia, PublicVariant, StoreCatalogProduct } from '@vendedoria/contracts';
import type { CartLine } from '../../core/cart.service';
import { StoreApiService } from '../../core/store-api.service';

export type Product = StoreCatalogProduct;
export type BagItem = { handle: string; quantity: number };

/** Most units a buyer can take of one product, as in the original store. */
export const MAX_UNITS = 10;

/** Whole published catalog: the template filters, cross-sells and prices in the browser. */
@Injectable({ providedIn: 'root' })
export class SelectaCatalog {
  private readonly api = inject(StoreApiService);
  private pending: Promise<Product[]> | null = null;

  readonly products = signal<Product[]>([]);
  readonly loaded = signal(false);
  readonly failed = signal(false);

  load(): Promise<Product[]> {
    if (this.loaded()) return Promise.resolve(this.products());
    return (this.pending ??= this.fetch());
  }

  /** Fresh prices and stock before buying; keeps the last list on failure. */
  async refresh(): Promise<void> {
    try {
      await this.fetch();
    } catch {
      // The list already shown stays valid; the API re-checks everything at checkout.
    }
  }

  find(handle: string | null | undefined): Product | undefined {
    return this.products().find((p) => p.handle === handle);
  }

  private async fetch(): Promise<Product[]> {
    try {
      const items = await this.api.catalog();
      this.products.set(items);
      this.loaded.set(true);
      this.failed.set(false);
      return items;
    } catch (error) {
      if (!this.loaded()) this.failed.set(true);
      throw error;
    } finally {
      this.pending = null;
    }
  }
}

export const selectaCatalogResolver: ResolveFn<boolean> = async () => {
  try {
    await inject(SelectaCatalog).load();
  } catch {
    // Pages show their empty state; the shell stays usable.
  }
  return true;
};

export const category = (p: Product) => p.categories[0] ?? 'Otros';
export const photos = (p: Product): PublicMedia[] => p.media.filter((m) => m.kind !== 'related');
export const stockOf = (p: Product) => (p.isAvailable ? (p.stockLeft ?? MAX_UNITS) : 0);
export const maxUnits = (p: Product) => Math.min(stockOf(p), MAX_UNITS);

/** Cart line for the shared store cart. */
export function bagLine(p: Product, variant: PublicVariant | null = null): Omit<CartLine, 'key' | 'quantity'> {
  return {
    handle: p.handle,
    name: p.name,
    variantId: variant?.id ?? null,
    variantLabel: variant?.label ?? null,
    unitCents: variant?.priceCents ?? p.priceCents,
    currency: p.currency,
    imageUrl: variant?.imageUrl ?? p.imageUrl,
  };
}

/** Can be added in one click: available and without a variant to choose. */
export const buyable = (p: Product | undefined): p is Product => !!p && p.isAvailable && !p.hasVariants;

/** Sets that contain the piece: upsell from the single product page. */
export function setsWith(p: Product, catalog: Product[]): Product[] {
  return catalog.filter((s) => s.format === 'set' && buyable(s) && s.includes.some((i) => i.handle === p.handle));
}

/** Pieces of a set sold alone: downsell from the set page. */
export function piecesOf(set: Product, catalog: Product[]): Product[] {
  const seen = new Set<string>();
  return set.includes.flatMap((i) => {
    const p = catalog.find((c) => c.handle === i.handle && c.handle !== set.handle);
    if (!buyable(p) || seen.has(p.handle)) return [];
    seen.add(p.handle);
    return [p];
  });
}

/** Price of the pieces bought separately, only when every piece is sold alone. */
export function piecesTotal(set: Product, catalog: Product[]): number | null {
  if (!set.includes.length) return null;
  let total = 0;
  for (const piece of set.includes) {
    const p = catalog.find((c) => c.handle === piece.handle);
    if (!p) return null;
    total += p.priceCents * piece.quantity;
  }
  return total;
}

/** What a set saves against its pieces; -1 when it cannot be compared. */
export function setSaving(set: Product, catalog: Product[]): number {
  const total = piecesTotal(set, catalog);
  return total === null ? -1 : total - set.priceCents;
}

const handlesOf = (p: Product) => [p.handle, ...p.includes.flatMap((i) => (i.handle ? [i.handle] : []))];

/**
 * Low-priced complements for the order bump and the cross-sell. Skips what is already in the bag
 * and what shares stock with it (a set and its pieces use the same units).
 */
export function complements(items: BagItem[], catalog: Product[], limit = 3, maxCents = 3500): Product[] {
  const chosen = items.flatMap((i) => {
    const p = catalog.find((c) => c.handle === i.handle);
    return p ? [p] : [];
  });
  if (!chosen.length) return [];
  const taken = new Set(chosen.flatMap(handlesOf));
  const lines = new Set(chosen.map((p) => p.lineKey).filter(Boolean));
  const categories = new Set(chosen.map(category));
  const score = (p: Product) => (p.lineKey && lines.has(p.lineKey) ? 0 : categories.has(category(p)) ? 1 : 2);
  return catalog
    .filter(
      (p) =>
        buyable(p) &&
        p.format !== 'set' &&
        p.priceCents <= maxCents &&
        !handlesOf(p).some((h) => taken.has(h)) &&
        score(p) < 2,
    )
    .sort((a, b) => score(a) - score(b) || a.priceCents - b.priceCents)
    .slice(0, limit);
}

/** Availability message from the real stock. */
export function scarcity(p: Product): string {
  const left = p.isAvailable ? p.stockLeft : null;
  if (left === 1) return 'Última unidad';
  if (left !== null && left > 1 && left <= 3) return `Solo quedan ${left}`;
  return '';
}
