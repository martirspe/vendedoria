import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import type {
  CheckoutItemInput,
  CheckoutRequest,
  CouponPreviewResult,
  PayOrderRequest,
  ProductKind,
  PublicOrder,
  PublicLiveReservation,
  PublicProductDetail,
  PublicProductList,
  PublicProductSort,
  ShippingMode,
  ShippingQuote,
  StoreCatalogProduct,
  StorefrontView,
  UbigeoDistrict,
  RecoveryOptions,
  RecoveryCaptureRequest,
  RecoveryCaptureResult,
  RecoveredCart,
  StoreRecommendations,
} from '@vendedoria/contracts';
import { STORE_PROXY_PREFIX, TURNSTILE_HEADER } from './store-context';

export type ProductListParams = {
  category?: string | null;
  kind?: ProductKind | null;
  q?: string | null;
  filters?: string | null;
  minPriceCents?: number | null;
  maxPriceCents?: number | null;
  sort?: PublicProductSort | null;
  page?: number | null;
  pageSize?: number;
};

@Injectable({ providedIn: 'root' })
export class StoreApiService {
  private readonly http = inject(HttpClient);

  liveReservation(token: string): Promise<PublicLiveReservation> {
    return firstValueFrom(this.http.post<PublicLiveReservation>(`${STORE_PROXY_PREFIX}/live-reservation`, { token }));
  }

  recoveryOptions(): Promise<RecoveryOptions> {
    return firstValueFrom(this.http.get<RecoveryOptions>(`${STORE_PROXY_PREFIX}/recovery/options`));
  }
  captureRecovery(body: RecoveryCaptureRequest, token?: string): Promise<RecoveryCaptureResult> {
    return firstValueFrom(this.http.post<RecoveryCaptureResult>(`${STORE_PROXY_PREFIX}/recovery`, body, token ? { headers: { [TURNSTILE_HEADER]: token } } : {}));
  }
  restoreRecovery(token: string): Promise<RecoveredCart> {
    return firstValueFrom(this.http.post<RecoveredCart>(`${STORE_PROXY_PREFIX}/recovery/restore`, { token }));
  }
  revokeRecovery(token: string): Promise<{ revoked: boolean }> {
    return firstValueFrom(this.http.post<{ revoked: boolean }>(`${STORE_PROXY_PREFIX}/recovery/revoke`, { token }));
  }
  recoveryActivity(token: string, items: CheckoutItemInput[]): Promise<unknown> {
    return firstValueFrom(this.http.post(`${STORE_PROXY_PREFIX}/recovery/activity`, { token, items }));
  }
  recommendations(handles: string[], context: 'product' | 'cart' | 'checkout', sessionId?: string): Promise<StoreRecommendations> {
    return firstValueFrom(this.http.get<StoreRecommendations>(`${STORE_PROXY_PREFIX}/recommendations`, { params: { handles: handles.join(','), context, ...(sessionId ? { sessionId } : {}) } }));
  }
  behavior(sessionId: string, handle: string, kind: 'VIEW' | 'CART'): Promise<unknown> {
    return firstValueFrom(this.http.post(`${STORE_PROXY_PREFIX}/behavior`, { sessionId, handle, kind, consent: true }));
  }
  forgetBehavior(sessionId: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`${STORE_PROXY_PREFIX}/behavior/forget`, { sessionId }));
  }

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

  ubigeos(): Promise<UbigeoDistrict[]> {
    return firstValueFrom(this.http.get<UbigeoDistrict[]>(`${STORE_PROXY_PREFIX}/ubigeos`));
  }

  /** Bounded featured collection with details, pieces and media. */
  catalog(): Promise<StoreCatalogProduct[]> {
    return firstValueFrom(this.http.get<StoreCatalogProduct[]>(`${STORE_PROXY_PREFIX}/catalog`));
  }

  catalogProduct(handle: string): Promise<StoreCatalogProduct | null> {
    return this.orNull(this.http.get<StoreCatalogProduct>(`${STORE_PROXY_PREFIX}/catalog/${encodeURIComponent(handle)}`));
  }

  /** Reference Olva/Shalom rates to a district. */
  shippingQuote(ubigeo: string): Promise<ShippingQuote[]> {
    return firstValueFrom(
      this.http.get<ShippingQuote[]>(`${STORE_PROXY_PREFIX}/shipping-quote`, { params: { ubigeo } }),
    );
  }

  previewCoupon(body: {
    items: CheckoutItemInput[];
    code: string;
    email?: string;
    mode?: ShippingMode;
  }): Promise<CouponPreviewResult> {
    return firstValueFrom(
      this.http.post<CouponPreviewResult>(`${STORE_PROXY_PREFIX}/coupons/preview`, body),
    );
  }

  /** `turnstileToken` is required when the store view carries `checkout.turnstileSiteKey`. */
  checkout(body: CheckoutRequest, turnstileToken?: string): Promise<PublicOrder> {
    return firstValueFrom(
      this.http.post<PublicOrder>(
        `${STORE_PROXY_PREFIX}/checkout`,
        body,
        turnstileToken ? { headers: { [TURNSTILE_HEADER]: turnstileToken } } : {},
      ),
    );
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
