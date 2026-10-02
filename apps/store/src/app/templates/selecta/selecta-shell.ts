import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  Renderer2,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { CartService } from '../../core/cart.service';
import { StoreStateService } from '../../core/store-state.service';
import { productReference, whatsappUrl } from '../../core/whatsapp';
import { SelectaCatalog } from './selecta-catalog';
import { selectaCopy, wholeMoney } from './selecta-copy';
import { SelectaIcon } from './selecta-icon';

const BODY_CLASS = 'tpl-selecta';

@Component({
  selector: 'selecta-shell',
  imports: [RouterOutlet, RouterLink, SelectaIcon],
  templateUrl: './selecta-shell.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectaShell {
  private readonly router = inject(Router);
  private readonly state = inject(StoreStateService);
  private readonly catalog = inject(SelectaCatalog);
  readonly cart = inject(CartService);

  readonly store = this.state.store;
  readonly copy = computed(() => {
    const store = this.store();
    return store ? selectaCopy(store) : null;
  });
  readonly freeFrom = computed(() => this.store()?.shipping.freeShippingFromCents ?? 0);
  readonly freeLabel = computed(() => {
    const store = this.store();
    return store && this.freeFrom() ? wholeMoney(store, this.freeFrom()) : '';
  });
  readonly symbol = computed(() => (this.store()?.displayName.trim().charAt(0).toUpperCase() ?? '') + '.');
  readonly currentUrl = signal(this.router.url);
  readonly onProduct = computed(() => this.currentUrl().startsWith('/producto/'));
  readonly showTop = signal(false);

  readonly whatsapp = computed(() => {
    const store = this.store();
    if (!store?.whatsappPhone) return null;
    const url = this.currentUrl();
    const handle = url.split(/[?#]/)[0].split('/')[2];
    const product = url.startsWith('/producto/') ? this.catalog.find(handle) : undefined;
    const text = url.startsWith('/checkout')
      ? `Hola, necesito ayuda para finalizar mi compra en ${store.displayName}.`
      : product
        ? `Hola, me interesa ${product.name} (${this.state.formatMoney(product.priceCents)}). ${productReference(product.handle)}`
        : `Hola, quisiera consultar el catálogo de ${store.displayName}.`;
    return whatsappUrl(store.whatsappPhone, text);
  });

  constructor() {
    const document = inject(DOCUMENT);
    const renderer = inject(Renderer2);
    renderer.addClass(document.body, BODY_CLASS);
    inject(DestroyRef).onDestroy(() => renderer.removeClass(document.body, BODY_CLASS));

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => this.currentUrl.set(event.urlAfterRedirects));

    afterNextRender(() => {
      const store = this.store();
      if (store) this.cart.load(store.slug);
      const onScroll = () => this.showTop.set(scrollY > 700);
      addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    });
  }

  toTop(): void {
    scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    document.querySelector<HTMLElement>('.brand')?.focus({ preventScroll: true });
  }
}
