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
  imports: [RouterLink, DsIconComponent, ProductCardComponent],
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
    return this.categoria() || 'Todos los productos';
  });

  constructor() {
    effect(() => {
      const page = this.list().page;
      const params = new URLSearchParams();
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
}
