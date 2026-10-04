import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import type {
  PublicProductCard,
  PublicProductList,
  StoreCatalogProduct,
} from '@vendedoria/contracts';
import { StoreApiService } from '../../core/store-api.service';

export type StrideSelection = {
  list: PublicProductList | null;
  stock: Pick<
    StoreCatalogProduct,
    'handle' | 'stockLeft' | 'isAvailable'
  > | null;
};

export function strideSpotlight(
  products: PublicProductCard[],
): PublicProductCard | null {
  const available = products.filter((product) => product.isAvailable);
  return (
    available.find((product) =>
      /calzado|zapatilla|sneaker|botas|sandalias|zapatos/i.test(
        [product.name, ...product.categories].join(' '),
      ),
    ) ??
    available[0] ??
    null
  );
}

/** Read stock only for the featured protagonist; failure never hides the collection. */
export async function loadStrideSelection(
  api: StoreApiService,
): Promise<StrideSelection> {
  let list: PublicProductList;
  try {
    list = await api.products({ sort: 'featured', pageSize: 8 });
  } catch {
    return { list: null, stock: null };
  }
  const product = strideSpotlight(list.items);
  if (!product) return { list, stock: null };
  try {
    const detail = await api.catalogProduct(product.handle);
    return {
      list,
      stock: detail
        ? {
            handle: detail.handle,
            stockLeft: detail.stockLeft,
            isAvailable: detail.isAvailable,
          }
        : null,
    };
  } catch {
    return { list, stock: null };
  }
}

/** A failed collection leaves the home usable and offers an explicit retry. */
export const strideSelectionResolver: ResolveFn<StrideSelection> = () =>
  loadStrideSelection(inject(StoreApiService));
