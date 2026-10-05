import { Injectable, computed, inject, signal } from '@angular/core';
import { AnalyticsService } from './analytics.service';
import { TemplateDemo } from './template-demo';

export type CartLine = {
  key: string;
  handle: string;
  name: string;
  variantId: string | null;
  variantLabel: string | null;
  unitCents: number;
  currency: string;
  imageUrl: string | null;
  quantity: number;
  /** Services are not shipped; carts saved before this flag count as products. */
  isService?: boolean;
  /** Digital products are not shipped either: the access arrives once the order is paid. */
  isDigital?: boolean;
};

const MAX_QUANTITY = 99;
const STORAGE_PREFIX = 'vendedoria-cart:';

/** Browser-only cart, one per store (keyed by slug in localStorage). */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly analytics = inject(AnalyticsService);
  private readonly demo = inject(TemplateDemo);
  private storageKey: string | null = null;

  readonly lines = signal<CartLine[]>([]);
  readonly ready = signal(false);
  readonly count = computed(() =>
    this.lines().reduce((total, line) => total + line.quantity, 0),
  );
  /** Delivery is asked only when something in the bag is shipped. */
  readonly needsDelivery = computed(() =>
    this.lines().some((line) => !line.isService && !line.isDigital),
  );
  readonly hasServices = computed(() => this.lines().some((line) => line.isService));
  readonly hasDigital = computed(() => this.lines().some((line) => line.isDigital));
  readonly subtotalCents = computed(() =>
    this.lines().reduce((total, line) => total + line.unitCents * line.quantity, 0),
  );

  /** Call only in the browser (after render). */
  load(slug: string): void {
    this.storageKey = this.demo.template ? `${STORAGE_PREFIX}demo:${this.demo.template}` : `${STORAGE_PREFIX}${slug}`;
    try {
      const storage = this.demo.active ? sessionStorage : localStorage;
      const raw = storage.getItem(this.storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      this.lines.set(Array.isArray(parsed) ? parsed.filter(isCartLine) : []);
    } catch {
      this.lines.set([]);
    }
    this.ready.set(true);
  }

  /** `max` caps the line (stock or per-order limit); the bag never exceeds what can be bought. */
  add(line: Omit<CartLine, 'key' | 'quantity'>, quantity: number, max = MAX_QUANTITY): void {
    const key = `${line.handle}::${line.variantId ?? ''}`;
    const cap = (n: number) => Math.min(clamp(n), Math.max(max, 1));
    this.update((lines) => {
      const existing = lines.find((item) => item.key === key);
      if (existing) {
        return lines.map((item) =>
          item.key === key
            ? { ...item, ...line, quantity: cap(item.quantity + quantity) }
            : item,
        );
      }
      return [...lines, { ...line, key, quantity: cap(quantity) }];
    });
    this.analytics.addToCart(
      { id: line.handle, name: line.name, priceCents: line.unitCents, quantity: clamp(quantity) },
      line.currency,
    );
  }

  setQuantity(key: string, quantity: number): void {
    this.update((lines) =>
      lines.map((item) => (item.key === key ? { ...item, quantity: clamp(quantity) } : item)),
    );
  }

  remove(key: string): void {
    this.update((lines) => lines.filter((item) => item.key !== key));
  }

  clear(): void {
    this.update(() => []);
  }

  restore(lines: Omit<CartLine, 'key'>[]): void {
    this.update(() => lines.map((line) => ({ ...line, key: `${line.handle}::${line.variantId ?? ''}` })));
  }

  /** A LIVE hold uses a route-scoped bag without replacing the shopper's saved cart. */
  restoreTransient(lines: Omit<CartLine, 'key'>[]): void {
    this.storageKey = null;
    this.restore(lines);
    this.ready.set(true);
  }

  private update(change: (lines: CartLine[]) => CartLine[]): void {
    this.lines.update(change);
    if (this.storageKey) {
      try {
        const storage = this.demo.active ? sessionStorage : localStorage;
        storage.setItem(this.storageKey, JSON.stringify(this.lines()));
      } catch {
        // Storage full or blocked (private mode): the cart still works for this visit.
      }
    }
  }
}

function clamp(quantity: number): number {
  return Math.min(Math.max(Math.trunc(quantity) || 1, 1), MAX_QUANTITY);
}

function isCartLine(value: unknown): value is CartLine {
  const line = value as Partial<CartLine> | null;
  return (
    typeof line?.key === 'string' &&
    typeof line.handle === 'string' &&
    typeof line.name === 'string' &&
    typeof line.unitCents === 'number' &&
    typeof line.quantity === 'number'
  );
}
