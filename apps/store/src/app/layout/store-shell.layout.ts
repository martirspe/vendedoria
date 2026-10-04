import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { DsIconComponent } from '@vendedoria/ui';
import { CartService } from '../core/cart.service';
import { catalogNoun, visibleKindTabs } from '../core/catalog-kinds';
import { markNotFound } from '../core/not-found-status';
import { announcementText } from '../core/page-copy';
import { STORE_EDITOR, StoreEditorBridge } from '../core/store-editor';
import { StoreStateService } from '../core/store-state.service';
import { THEME_CORNERS, THEME_FONTS, readableTextOn, storeBrand } from '../core/theme';
import { whatsappUrl } from '../core/whatsapp';
import { LEGAL_LINKS } from '../features/legal/legal-slugs';

@Component({
  selector: 'store-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DsIconComponent, STORE_EDITOR],
  templateUrl: './store-shell.layout.html',
  styleUrl: './store-shell.layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreShellLayout {
  private readonly state = inject(StoreStateService);
  private readonly router = inject(Router);
  readonly cart = inject(CartService);
  readonly editor = inject(StoreEditorBridge);
  private readonly currentUrl = signal(this.router.url);
  readonly inCheckout = computed(() => this.currentUrl().split(/[?#]/)[0] === '/checkout');

  readonly store = this.state.store;
  readonly year = new Date().getFullYear();
  readonly legalLinks = LEGAL_LINKS;
  readonly brand = computed(() => {
    const store = this.store();
    return store ? storeBrand(store) : null;
  });
  readonly onBrand = computed(() => readableTextOn(this.brand()?.primary ?? ''));
  readonly font = computed(() => {
    const font = this.store()?.templateContent.theme?.font;
    return font ? THEME_FONTS[font] : null;
  });
  readonly announcement = computed(() => {
    const store = this.store();
    return (store && announcementText(store.templateContent)) ?? '';
  });
  readonly kindTabs = computed(() => visibleKindTabs(this.store()?.kinds));
  readonly catalogNoun = computed(() => catalogNoun(this.store()?.kinds));
  readonly corners = computed(() => THEME_CORNERS[this.store()?.templateContent.theme?.corners ?? 'soft']);
  readonly whatsappHref = computed(() => {
    const store = this.store();
    return store?.whatsappPhone
      ? whatsappUrl(store.whatsappPhone, `Hola ${store.displayName}, tengo una consulta.`)
      : null;
  });

  constructor() {
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe((event) => this.currentUrl.set(event.urlAfterRedirects));
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
    if (this.editor.active()) return;
    const q = query.trim();
    void this.router.navigate(['/productos'], { queryParams: q ? { q } : {} });
  }
}
