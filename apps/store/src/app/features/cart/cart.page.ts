import { RecommendationsComponent } from '../../components/recommendations.component';
import { CartRecoveryComponent } from '../../components/cart-recovery.component';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DsIconComponent } from '@vendedoria/ui';
import { CartService } from '../../core/cart.service';
import { MoneyPipe } from '../../core/money.pipe';
import { SeoService } from '../../core/seo.service';
import { StoreStateService } from '../../core/store-state.service';
import { whatsappUrl } from '../../core/whatsapp';

@Component({
  selector: 'store-cart-page',
  imports: [RecommendationsComponent, CartRecoveryComponent, RouterLink, DsIconComponent, MoneyPipe],
  templateUrl: './cart.page.html',
  styleUrl: './cart.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartPage {
  private readonly state = inject(StoreStateService);
  readonly cart = inject(CartService);
  readonly store = this.state.store;
  readonly recommendationHandles = computed(() => this.cart.lines().map((line) => line.handle));
  readonly onlineCheckout = computed(() => this.store()?.checkout.mode === 'online');

  /** The order message carries one product reference per line for the sales agent. */
  readonly orderHref = computed(() => {
    const store = this.store();
    const lines = this.cart.lines();
    if (!store?.whatsappPhone || !lines.length) {
      return null;
    }
    const items = lines.map((line) => {
      const variant = line.variantLabel ? ` (${line.variantLabel})` : '';
      const total = this.state.formatMoney(line.unitCents * line.quantity, line.currency);
      const ref = line.variantId ? `${line.handle}:${line.variantId}` : line.handle;
      return `• ${line.quantity} × ${line.name}${variant} — ${total} [P-${ref}]`;
    });
    const text = [
      `Hola ${store.displayName}, quiero hacer este pedido:`,
      ...items,
      `Subtotal: ${this.state.formatMoney(this.cart.subtotalCents())}`,
      '¿Me confirman stock, envío y forma de pago?',
    ].join('\n');
    return whatsappUrl(store.whatsappPhone, text);
  });

  constructor() {
    inject(SeoService).set({ title: 'Tu carrito', path: '/carrito', noindex: true });
  }

  changeQuantity(key: string, current: number, delta: number): void {
    this.cart.setQuantity(key, current + delta);
  }
}
