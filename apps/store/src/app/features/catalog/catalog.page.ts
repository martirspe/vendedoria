import { DsSelectComponent } from '@vendedoria/ui';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { PublicProductList, PublicProductSort } from '@vendedoria/contracts';
import { DsIconComponent } from '@vendedoria/ui';
import { ProductCardComponent } from '../../components/product-card.component';
import { catalogNoun, kindTab, visibleKindTabs } from '../../core/catalog-kinds';
import { SeoService } from '../../core/seo.service';
import { StoreStateService } from '../../core/store-state.service';

const SORT_OPTIONS: Array<{ value: PublicProductSort; label: string }> = [
  { value: 'featured', label: 'Destacados' },
  { value: 'newest', label: 'Más recientes' },
  { value: 'price-asc', label: 'Precio: menor a mayor' },
  { value: 'price-desc', label: 'Precio: mayor a menor' },
];

@Component({
  selector: 'store-catalog-page',
  imports: [DsSelectComponent, RouterLink, DsIconComponent, ProductCardComponent],
  templateUrl: './catalog.page.html',
  styleUrl: './catalog.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogPage {
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);
  readonly store = inject(StoreStateService).store;
  readonly sortOptions = SORT_OPTIONS;

  readonly list = input.required<PublicProductList>();
  /** Query params, bound by the router. */
  readonly categoria = input<string>();
  readonly q = input<string>();
  readonly orden = input<string>();
  readonly tipo = input<string>();

  readonly kindTabs = computed(() => visibleKindTabs(this.store()?.kinds));
  readonly activeKind = computed(() => kindTab(this.tipo()));
  /** Name of what is listed: the chosen kind, or the whole catalog ("servicios" in a services-only store). */
  readonly noun = computed(() => this.activeKind() ?? catalogNoun(this.store()?.kinds));

  readonly sort = computed(
    () => SORT_OPTIONS.find((option) => option.value === this.orden())?.value ?? 'featured',
  );
  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.list().total / this.list().pageSize)),
  );
  readonly heading = computed(() => {
    if (this.q()) {
      return `Resultados para “${this.q()}”`;
    }
    if (this.categoria()) {
      return this.categoria()!;
    }
    const noun = this.noun();
    return this.activeKind() ? noun.label : `Todos los ${noun.param}`;
  });

  constructor() {
    effect(() => {
      const page = this.list().page;
      const params = new URLSearchParams();
      if (this.activeKind()) params.set('tipo', this.activeKind()!.param);
      if (this.categoria()) params.set('categoria', this.categoria()!);
      if (page > 1) params.set('pagina', String(page));
      const query = params.toString();
      this.seo.set({
        title: this.heading(),
        description: this.categoria()
          ? `${this.categoria()} en ${this.store()?.displayName ?? 'nuestra tienda'}.`
          : null,
        path: `/productos${query ? `?${query}` : ''}`,
      });
    });
  }

  changeSort(value: string): void {
    void this.router.navigate([], {
      queryParams: { orden: value === 'featured' ? null : value, pagina: null },
      queryParamsHandling: 'merge',
    });
  }

  searchCatalog(value: string): void {
    void this.router.navigate([], {
      queryParams: { q: value.trim().slice(0, 80) || null, pagina: null },
      queryParamsHandling: 'merge',
    });
  }
}
