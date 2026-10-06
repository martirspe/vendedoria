import { inject } from '@angular/core';
import { CanMatchFn, ResolveFn } from '@angular/router';
import type {
  PublicProductDetail,
  PublicProductList,
  PublicProductSort,
  StoreTemplate,
  StorefrontView,
} from '@vendedoria/contracts';
import { kindTab } from './core/catalog-kinds';
import { catalogPriceCents, catalogSelections } from './core/catalog-query';
import { StoreApiService } from './core/store-api.service';
import { StoreStateService } from './core/store-state.service';

export const CATALOG_PAGE_SIZE = 24;
const SORTS: PublicProductSort[] = ['featured', 'newest', 'price-asc', 'price-desc'];

/** Loads the store of this host once; call it inside an injection context. */
function loadStore(): Promise<StorefrontView | null> {
  const state = inject(StoreStateService);
  const api = inject(StoreApiService);
  const current = state.store();
  if (current) {
    return Promise.resolve(current);
  }
  return api.store().then((store) => {
    state.store.set(store);
    return store;
  });
}

export const storeResolver: ResolveFn<StorefrontView | null> = () => loadStore();

/** Routes of a store template match only when the store uses that template. */
export const templateMatch =
  (template: StoreTemplate): CanMatchFn =>
  async () => {
    const store = await loadStore();
    return (store?.themeRelease?.renderer ?? store?.template) === template;
  };

export const featuredResolver: ResolveFn<PublicProductList> = () =>
  inject(StoreApiService).products({ sort: 'featured', pageSize: 8 });

export const catalogResolver: ResolveFn<PublicProductList | null> = (route) => {
  const params = route.queryParamMap;
  const sort = params.get('orden') as PublicProductSort | null;
  const page = Number(params.get('pagina') ?? 1);
  const filters = catalogSelections(params.get('filtros'));
  const pageSize = Number(params.get('porPagina') ?? CATALOG_PAGE_SIZE);
  return inject(StoreApiService).products({
    category: params.get('categoria'),
    kind: kindTab(params.get('tipo'))?.kind ?? null,
    q: params.get('q'),
    filters: filters.length ? JSON.stringify(filters) : null,
    minPriceCents: catalogPriceCents(params.get('desde')),
    maxPriceCents: catalogPriceCents(params.get('hasta')),
    sort: sort && SORTS.includes(sort) ? sort : 'featured',
    page: Number.isInteger(page) && page > 0 && page <= 500 ? page : 1,
    pageSize: [12, 24, 48].includes(pageSize) ? pageSize : CATALOG_PAGE_SIZE,
  }).catch(() => null);
};

export const productResolver: ResolveFn<PublicProductDetail | null> = (route) =>
  inject(StoreApiService).product(route.paramMap.get('handle') ?? '');
