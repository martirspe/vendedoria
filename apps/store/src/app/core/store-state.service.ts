import { Injectable, computed, signal } from '@angular/core';
import type { StorefrontView } from '@vendedoria/contracts';

@Injectable({ providedIn: 'root' })
export class StoreStateService {
  readonly store = signal<StorefrontView | null>(null);

  readonly locale = computed(() => `es-${this.store()?.country ?? 'PE'}`);

  readonly currency = computed(() => this.store()?.currency ?? 'PEN');

  formatMoney(cents: number, currency = this.currency()): string {
    return new Intl.NumberFormat(this.locale(), {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(cents / 100);
  }
}
