import { RecommendationsComponent } from '../../components/recommendations.component';
import { CartRecoveryComponent } from '../../components/cart-recovery.component';
import { ChangeDetectionStrategy, Component, afterNextRender, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartLine, CartService } from '../../core/cart.service';
import { MoneyPipe } from '../../core/money.pipe';
import { SeoService } from '../../core/seo.service';
import { StoreStateService } from '../../core/store-state.service';
import { whatsappUrl } from '../../core/whatsapp';
import { SelectaCatalog, maxUnits } from './selecta-catalog';
import { wholeMoney } from '../../core/store-faq';
import { SelectaIcon } from './selecta-icon';
import { SelectaProductImage } from './selecta-photo';

@Component({
  selector: 'selecta-cart',
  imports: [RecommendationsComponent, CartRecoveryComponent, RouterLink, MoneyPipe, SelectaIcon, SelectaProductImage],
  templateUrl: './cart.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectaCartPage {
  private readonly state = inject(StoreStateService);
  private readonly catalog = inject(SelectaCatalog);
  readonly cart = inject(CartService);
  readonly store = this.state.store;

  readonly online = computed(() => this.store()?.checkout.mode === 'online');
  readonly rows = computed(() =>
    this.cart.lines().map((line) => {
      const product = this.catalog.find(line.handle);
      const variant = line.variantId ? product?.variants.find((v) => v.id === line.variantId) : undefined;
      const available = Boolean(product?.isAvailable) && (!line.variantId || Boolean(variant?.isAvailable));
      const unitCents = variant?.priceCents ?? product?.priceCents ?? line.unitCents;
      return { line, product, unitCents, max: product && available ? maxUnits(product) : 0 };
    }),
  );
  readonly invalid = computed(() => this.rows().some((r) => r.line.quantity > r.max));
  /** Live catalog prices: the bag never shows a price the checkout will not charge. */
  readonly total = computed(() => this.rows().reduce((n, r) => n + r.unitCents * r.line.quantity, 0));
  readonly recommendationHandles = computed(() => this.cart.lines().map((line) => line.handle));
  readonly freeFrom = computed(() => this.store()?.shipping.freeShippingFromCents ?? 0);
  readonly missing = computed(() => this.freeFrom() - this.total());
  readonly progress = computed(() =>
    this.freeFrom() > 0 ? Math.min(100, Math.round((this.total() / this.freeFrom()) * 100)) : 100,
  );
  readonly carrierNames = computed(() =>
    (this.store()?.shipping.options ?? [])
      .filter((o) => o.mode !== 'PICKUP')
      .map((o) => (o.mode === 'OLVA' ? 'Olva' : o.mode === 'SHALOM' ? 'Shalom' : o.label))
      .join(' o '),
  );
  readonly freeLabel = computed(() => {
    const store = this.store();
    return store ? wholeMoney(store, this.freeFrom()) : '';
  });

  /** The order message carries one product reference per line for the sales agent. */
  readonly orderHref = computed(() => {
    const store = this.store();
    const lines = this.cart.lines();
    if (!store?.whatsappPhone || !lines.length) return null;
    const items = this.rows().map(({ line, unitCents }) => {
      const variant = line.variantLabel ? ` (${line.variantLabel})` : '';
      const total = this.state.formatMoney(unitCents * line.quantity, line.currency);
      const ref = line.variantId ? `${line.handle}:${line.variantId}` : line.handle;
      return `• ${line.quantity} × ${line.name}${variant} — ${total} [P-${ref}]`;
    });
    const text = [
      `Hola ${store.displayName}, quiero hacer este pedido:`,
      ...items,
      `Subtotal: ${this.state.formatMoney(this.total())}`,
      '¿Me confirman stock, envío y forma de pago?',
    ].join('\n');
    return whatsappUrl(store.whatsappPhone, text);
  });


  constructor() {
    inject(SeoService).set({ title: 'Mi bolsa', path: '/carrito', noindex: true });
    effect(() => {
      const handles = this.cart.lines().map((line) => line.handle);
      void this.catalog.ensure(handles).catch(() => undefined);
    });
    afterNextRender(() => void this.catalog.refresh());
  }

  change(line: CartLine, delta: number): void {
    const quantity = line.quantity + delta;
    if (quantity <= 0) this.cart.remove(line.key);
    else this.cart.setQuantity(line.key, quantity);
  }

}
