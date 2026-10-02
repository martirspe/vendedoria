import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import type {
  CheckoutItemInput,
  CheckoutRequest,
  CouponPreviewResult,
  PayOrderRequest,
  PublicOrder,
  PublicProductDetail,
  PublicProductList,
  PublicProductSort,
  StorefrontView,
} from '@vendedoria/contracts';
import { STORE_PROXY_PREFIX } from './store-context';

export type ProductListParams = {
  category?: string | null;
  q?: string | null;
  sort?: PublicProductSort | null;
  page?: number | null;
  pageSize?: number;
};

@Injectable({ providedIn: 'root' })
export class StoreApiService {
  private readonly http = inject(HttpClient);

  store(): Promise<StorefrontView | null> {
    return this.orNull(this.http.get<StorefrontView>(STORE_PROXY_PREFIX));
  }

  products(params: ProductListParams): Promise<PublicProductList> {
    let query = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined && value !== '') {
        query = query.set(key, String(value));
      }
    }
    return firstValueFrom(
      this.http.get<PublicProductList>(`${STORE_PROXY_PREFIX}/products`, {
        params: query,
      }),
    );
  }

  product(handle: string): Promise<PublicProductDetail | null> {
    return this.orNull(
      this.http.get<PublicProductDetail>(
        `${STORE_PROXY_PREFIX}/products/${encodeURIComponent(handle)}`,
      ),
    );
  }

  previewCoupon(body: {
    items: CheckoutItemInput[];
    code: string;
    email?: string;
  }): Promise<CouponPreviewResult> {
    return firstValueFrom(
      this.http.post<CouponPreviewResult>(`${STORE_PROXY_PREFIX}/coupons/preview`, body),
    );
  }

  checkout(body: CheckoutRequest): Promise<PublicOrder> {
    return firstValueFrom(this.http.post<PublicOrder>(`${STORE_PROXY_PREFIX}/checkout`, body));
  }

  order(id: string, token: string): Promise<PublicOrder | null> {
    return this.orNull(
      this.http.get<PublicOrder>(`${STORE_PROXY_PREFIX}/orders/${encodeURIComponent(id)}`, {
        params: { token },
      }),
    );
  }

  pay(id: string, body: PayOrderRequest): Promise<PublicOrder> {
    return firstValueFrom(
      this.http.post<PublicOrder>(`${STORE_PROXY_PREFIX}/orders/${encodeURIComponent(id)}/pay`, body),
    );
  }

  cancel(id: string, token: string): Promise<PublicOrder> {
    return firstValueFrom(
      this.http.post<PublicOrder>(`${STORE_PROXY_PREFIX}/orders/${encodeURIComponent(id)}/cancel`, {
        token,
      }),
    );
  }

  simulate(id: string, token: string): Promise<PublicOrder> {
    return firstValueFrom(
      this.http.post<PublicOrder>(`${STORE_PROXY_PREFIX}/orders/${encodeURIComponent(id)}/simulate`, {
        token,
      }),
    );
  }

  private async orNull<T>(request: Observable<T>): Promise<T | null> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) {
        return null;
      }
      throw error;
    }
  }
}
