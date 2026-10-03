import { Injectable, computed, inject, signal } from '@angular/core';
import { AnalyticsService } from './analytics.service';

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
};

const MAX_QUANTITY = 99;
const STORAGE_PREFIX = 'vendedoria-cart:';

/** Browser-only cart, one per store (keyed by slug in localStorage). */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly analytics = inject(AnalyticsService);
  private storageKey: string | null = null;

  readonly lines = signal<CartLine[]>([]);
  readonly ready = signal(false);
  readonly count = computed(() =>
    this.lines().reduce((total, line) => total + line.quantity, 0),
  );
  readonly subtotalCents = computed(() =>
    this.lines().reduce((total, line) => total + line.unitCents * line.quantity, 0),
  );

  /** Call only in the browser (after render). */
  load(slug: string): void {
    this.storageKey = `${STORAGE_PREFIX}${slug}`;
    try {
      const raw = localStorage.getItem(this.storageKey);
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

  private update(change: (lines: CartLine[]) => CartLine[]): void {
    this.lines.update(change);
    if (this.storageKey) {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.lines()));
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
