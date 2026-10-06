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
import { announcementText } from '../../core/page-copy';
import { STORE_EDITOR, StoreEditorBridge } from '../../core/store-editor';
import { StoreStateService } from '../../core/store-state.service';
import { readableTextOn, storeTheme, THEME_FONTS } from '../../core/theme';
import { productReference, whatsappUrl } from '../../core/whatsapp';
import { SelectaCatalog } from './selecta-catalog';
import { wholeMoney } from '../../core/store-faq';
import { selectaCopy } from './selecta-copy';
import { SelectaIcon } from './selecta-icon';
import { StoreThemeTokens } from '../../core/theme-tokens.directive';
import { themeNavigation } from '../../core/theme-navigation';
import { ThemeSocialLinksComponent } from '../../components/theme-social-links.component';

const BODY_CLASS = 'tpl-selecta';
/** Non-injected `styles` bundle in angular.json: only Selecta stores download it. */
const STYLESHEET = '/selecta.css';

@Component({
  selector: 'selecta-shell',
  imports: [ThemeSocialLinksComponent, RouterOutlet, RouterLink, SelectaIcon, STORE_EDITOR],
  hostDirectives: [StoreThemeTokens],
  templateUrl: './selecta-shell.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--wine]': 'theme()?.primary',
    '[style.--sel-on-wine]': 'onBrand()',
    '[style.font-family]': 'font()?.body',
    '[style.--sel-body]': 'font()?.body',
    '[style.--sel-display]': 'font()?.display',
  },
})
export class SelectaShell {
  readonly year = new Date().getFullYear();
  private readonly router = inject(Router);
  private readonly state = inject(StoreStateService);
  private readonly catalog = inject(SelectaCatalog);
  readonly cart = inject(CartService);
  readonly editor = inject(StoreEditorBridge);

  readonly store = this.state.store;
  readonly navigation = computed(() => {
    const store = this.store();
    return store ? themeNavigation(store.templateContent) : null;
  });
  readonly copy = computed(() => {
    const store = this.store();
    return store ? selectaCopy(store) : null;
  });
  readonly freeFrom = computed(() => this.store()?.shipping.freeShippingFromCents ?? 0);
  readonly freeLabel = computed(() => {
    const store = this.store();
    return store && this.freeFrom() ? wholeMoney(store, this.freeFrom()) : '';
  });
  readonly customAnnouncement = computed(() => {
    const store = this.store();
    return store ? announcementText(store.templateContent) : undefined;
  });
  /** Merchant text, else the template line: free shipping or the tagline. */
  readonly announcement = computed(() => {
    const custom = this.customAnnouncement();
    if (custom !== undefined) return custom;
    const store = this.store();
    if (this.freeFrom() > 0) {
      const pay = store?.checkout.mode === 'online' ? ' · Paga con Yape o tarjeta' : '';
      return `Envío gratis en pedidos desde ${this.freeLabel()}${pay}`;
    }
    return store?.tagline || 'Una selección para regalar. Un ritual para ti.';
  });
  readonly theme = computed(() => this.store() ? storeTheme(this.store()!) : undefined);
  readonly onBrand = computed(() => {
    const primary = this.theme()?.primary;
    return primary ? readableTextOn(primary) : null;
  });
  readonly font = computed(() => {
    const font = this.theme()?.font;
    return font ? THEME_FONTS[font] : null;
  });
  /** Only a logo chosen in the editor: Selecta shows its monogram by default. */
  readonly logo = computed(() => this.theme()?.logo || null);
  readonly symbol = computed(() => (this.store()?.displayName.trim().charAt(0).toUpperCase() ?? '') + '.');
  readonly currentUrl = signal(this.router.url);
  readonly onProduct = computed(() => this.currentUrl().startsWith('/producto/'));
  readonly inCheckout = computed(() => this.currentUrl().split(/[?#]/)[0] === '/checkout');
  readonly showTop = signal(false);
  readonly footerInView = signal(false);

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
    if (!document.head.querySelector(`link[href="${STYLESHEET}"]`)) {
      const link = renderer.createElement('link') as HTMLLinkElement;
      renderer.setAttribute(link, 'rel', 'stylesheet');
      renderer.setAttribute(link, 'href', STYLESHEET);
      renderer.appendChild(document.head, link);
    }
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => renderer.removeClass(document.body, BODY_CLASS));

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
      destroyRef.onDestroy(() => removeEventListener('scroll', onScroll));
      const footer = document.querySelector('selecta-shell > footer');
      if (footer && typeof IntersectionObserver !== 'undefined') {
        const observer = new IntersectionObserver(([entry]) => {
          this.footerInView.set(entry?.isIntersecting ?? false);
        });
        observer.observe(footer);
        destroyRef.onDestroy(() => observer.disconnect());
      }
    });
  }

  toTop(): void {
    scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    document.querySelector<HTMLElement>('.brand')?.focus({ preventScroll: true });
  }
}
