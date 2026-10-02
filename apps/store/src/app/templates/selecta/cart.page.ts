import { ChangeDetectionStrategy, Component, afterNextRender, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartLine, CartService } from '../../core/cart.service';
import { MoneyPipe } from '../../core/money.pipe';
import { SeoService } from '../../core/seo.service';
import { StoreStateService } from '../../core/store-state.service';
import { whatsappUrl } from '../../core/whatsapp';
import { Product, SelectaCatalog, bagLine, complements, maxUnits, scarcity } from './selecta-catalog';
import { SelectaIcon } from './selecta-icon';
import { SelectaProductImage } from './selecta-photo';

@Component({
  selector: 'selecta-cart',
  imports: [RouterLink, MoneyPipe, SelectaIcon, SelectaProductImage],
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
      return { line, product, max: product && available ? maxUnits(product) : 0 };
    }),
  );
  readonly invalid = computed(() => this.rows().some((r) => r.line.quantity > r.max));
  readonly total = this.cart.subtotalCents;
  readonly extras = computed(() =>
    complements(
      this.cart.lines().map((l) => ({ handle: l.handle, quantity: l.quantity })),
      this.catalog.products(),
    ),
  );
  readonly freeFrom = computed(() => this.store()?.shipping.freeShippingFromCents ?? 0);
  readonly missing = computed(() => this.freeFrom() - this.total());
  readonly progress = computed(() =>
    this.freeFrom() > 0 ? Math.min(100, Math.round((this.total() / this.freeFrom()) * 100)) : 100,
  );
  readonly carrierNames = computed(() =>
    (this.store()?.shipping.options ?? [])
      .filter((o) => o.mode !== 'PICKUP')
      .map((o) => o.label)
      .join(' o '),
  );

  /** The order message carries one product reference per line for the sales agent. */
  readonly orderHref = computed(() => {
    const store = this.store();
    const lines = this.cart.lines();
    if (!store?.whatsappPhone || !lines.length) return null;
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

  readonly scarcity = scarcity;

  constructor() {
    inject(SeoService).set({ title: 'Mi bolsa', path: '/carrito', noindex: true });
    afterNextRender(() => void this.catalog.refresh());
  }

  change(line: CartLine, delta: number): void {
    const quantity = line.quantity + delta;
    if (quantity <= 0) this.cart.remove(line.key);
    else this.cart.setQuantity(line.key, quantity);
  }

  addExtra(p: Product): void {
    this.cart.add(bagLine(p), 1);
  }
}
