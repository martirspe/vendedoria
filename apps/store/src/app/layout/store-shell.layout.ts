import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  inject,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DsIconComponent } from '@vendedoria/ui';
import { CartService } from '../core/cart.service';
import { markNotFound } from '../core/not-found-status';
import { StoreStateService } from '../core/store-state.service';
import { readableTextOn } from '../core/theme';
import { whatsappUrl } from '../core/whatsapp';

@Component({
  selector: 'store-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DsIconComponent],
  templateUrl: './store-shell.layout.html',
  styleUrl: './store-shell.layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreShellLayout {
  private readonly state = inject(StoreStateService);
  private readonly router = inject(Router);
  readonly cart = inject(CartService);

  readonly store = this.state.store;
  readonly year = new Date().getFullYear();
  readonly onBrand = computed(() => readableTextOn(this.store()?.brandColor ?? ''));
  readonly whatsappHref = computed(() => {
    const store = this.store();
    return store?.whatsappPhone
      ? whatsappUrl(store.whatsappPhone, `Hola ${store.displayName}, tengo una consulta.`)
      : null;
  });

  constructor() {
    if (!this.store()) {
      markNotFound();
    }
    afterNextRender(() => {
      const store = this.store();
      if (store) {
        this.cart.load(store.slug);
      }
    });
  }

  search(event: Event, query: string): void {
    event.preventDefault();
    const q = query.trim();
    void this.router.navigate(['/productos'], { queryParams: q ? { q } : {} });
  }
}
