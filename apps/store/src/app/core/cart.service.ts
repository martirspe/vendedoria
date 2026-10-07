import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { AnalyticsService } from './analytics.service';
import { TemplateDemo } from './template-demo';
import { subtractPurchased } from './checkout-context';

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
  private readonly destroy = inject(DestroyRef);
  private settledOrders: string[] = [];
  private listening = false;
  private readonly snapshots = new Map<string, CartLine[]>();

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
      this.readStored(parsed);
    } catch {
      this.lines.set([]);
    }
    this.ready.set(true);
    if (!this.listening) {
      const sync = (event: StorageEvent) => {
        if (event.key !== this.storageKey) return;
        try { this.readStored(event.newValue ? JSON.parse(event.newValue) : []); } catch { /* Ignore corrupt writes. */ }
      };
      const sameTab = () => {
        if (!this.storageKey) return;
        try {
          const storage = this.demo.active ? sessionStorage : localStorage;
          const raw = storage.getItem(this.storageKey);
          this.readStored(raw ? JSON.parse(raw) : []);
        } catch { /* Ignore unavailable storage. */ }
      };
      window.addEventListener('storage', sync);
      window.addEventListener('vendedoria-cart-updated', sameTab);
      this.destroy.onDestroy(() => {
        window.removeEventListener('storage', sync);
        window.removeEventListener('vendedoria-cart-updated', sameTab);
      });
      this.listening = true;
    }
  }

  /** `max` caps the line (stock or per-order limit); the bag never exceeds what can be bought. */
  async add(line: Omit<CartLine, 'key' | 'quantity'>, quantity: number, max = MAX_QUANTITY): Promise<void> {
    const key = `${line.handle}::${line.variantId ?? ''}`;
    const cap = (n: number) => Math.min(clamp(n), Math.max(max, 1));
    await this.update((lines) => {
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

  /** Only cart purchases record a snapshot; direct and LIVE orders never consume the saved bag. */
  rememberOrder(orderId: string, lines: CartLine[] = this.lines()): void {
    if (!this.storageKey) return;
    this.snapshots.set(orderId, lines.map((line) => ({ ...line })));
    try { sessionStorage.setItem(`${this.storageKey}:order:${orderId}`, JSON.stringify(lines)); } catch { /* Visit-only fallback. */ }
  }

  completeOrder(orderId: string): void {
    if (!this.storageKey) return;
    const snapshotKey = `${this.storageKey}:order:${orderId}`;
    let purchased = this.snapshots.get(orderId);
    try {
      const raw = sessionStorage.getItem(snapshotKey);
      if (raw) { const parsed: unknown = JSON.parse(raw); if (Array.isArray(parsed)) purchased = parsed.filter(isCartLine); }
    } catch { /* Use the in-memory snapshot. */ }
    if (!purchased) return;
    this.update((lines) => {
      if (this.settledOrders.includes(orderId)) return lines;
      this.settledOrders = [...this.settledOrders, orderId];
      return subtractPurchased(lines, purchased!);
    });
    this.snapshots.delete(orderId);
    try { sessionStorage.removeItem(snapshotKey); } catch { /* The atomic cart envelope also records settlement. */ }
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

  private update(change: (lines: CartLine[]) => CartLine[]): Promise<void> {
    const key = this.storageKey;
    if (key && typeof navigator !== 'undefined' && navigator.locks) {
      // Cross-tab mutations read and write under one origin/store lock.
      return navigator.locks.request(key, () => {
        if (this.storageKey === key) this.applyChange(change);
      });
    }
    this.applyChange(change);
    return Promise.resolve();
  }

  private applyChange(change: (lines: CartLine[]) => CartLine[]): void {
    if (this.storageKey) {
      try {
        const storage = this.demo.active ? sessionStorage : localStorage;
        const raw = storage.getItem(this.storageKey);
        if (raw) this.readStored(JSON.parse(raw));
      } catch { /* Use the currently displayed bag. */ }
    }
    this.lines.update(change);
    if (this.storageKey) {
      try {
        const storage = this.demo.active ? sessionStorage : localStorage;
        storage.setItem(this.storageKey, JSON.stringify({ lines: this.lines(), settledOrders: this.settledOrders }));
        window.dispatchEvent(new Event('vendedoria-cart-updated'));
      } catch {
        // Storage full or blocked (private mode): the cart still works for this visit.
      }
    }
  }

  private readStored(value: unknown): void {
    const envelope = value as { lines?: unknown; settledOrders?: unknown } | null;
    const lines = Array.isArray(value) ? value : envelope?.lines;
    this.lines.set(Array.isArray(lines) ? lines.filter(isCartLine) : []);
    this.settledOrders = Array.isArray(envelope?.settledOrders) ? envelope.settledOrders.filter((id): id is string => typeof id === 'string') : [];
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
    && Number.isSafeInteger(line.unitCents) && line.unitCents >= 0
    && Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= MAX_QUANTITY
    && (line.variantId === null || typeof line.variantId === 'string')
    && typeof line.currency === 'string'
  );
}
