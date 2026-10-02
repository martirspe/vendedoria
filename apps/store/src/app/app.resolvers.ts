import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import type {
  PublicProductDetail,
  PublicProductList,
  PublicProductSort,
  StorefrontView,
} from '@vendedoria/contracts';
import { StoreApiService } from './core/store-api.service';
import { StoreStateService } from './core/store-state.service';

export const CATALOG_PAGE_SIZE = 24;
const SORTS: PublicProductSort[] = ['featured', 'newest', 'price-asc', 'price-desc'];

export const storeResolver: ResolveFn<StorefrontView | null> = async () => {
  const state = inject(StoreStateService);
  if (state.store()) {
    return state.store();
  }
  const store = await inject(StoreApiService).store();
  state.store.set(store);
  return store;
};

export const featuredResolver: ResolveFn<PublicProductList> = () =>
  inject(StoreApiService).products({ sort: 'featured', pageSize: 8 });

export const catalogResolver: ResolveFn<PublicProductList> = (route) => {
  const params = route.queryParamMap;
  const sort = params.get('orden') as PublicProductSort | null;
  const page = Number(params.get('pagina') ?? 1);
  return inject(StoreApiService).products({
    category: params.get('categoria'),
    q: params.get('q'),
    sort: sort && SORTS.includes(sort) ? sort : 'featured',
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: CATALOG_PAGE_SIZE,
  });
};

export const productResolver: ResolveFn<PublicProductDetail | null> = (route) =>
  inject(StoreApiService).product(route.paramMap.get('handle') ?? '');
