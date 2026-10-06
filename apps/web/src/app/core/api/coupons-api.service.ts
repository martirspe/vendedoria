import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type CouponKind = 'PERCENT' | 'FIXED' | 'FREE_SHIPPING' | 'BUY_X_GET_Y';
export type CouponMethod = 'CODE' | 'AUTOMATIC';
export type CouponScope = 'ALL' | 'CATEGORY' | 'BRAND' | 'LINE' | 'PRODUCTS';

export type CouponPayload = {
  code?: string;
  method: CouponMethod;
  label: string;
  note: string | null;
  kind: CouponKind;
  value: number;
  maxDiscountCents: number | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  maxApplications: number | null;
  minSubtotalCents: number;
  minItems: number;
  scope: CouponScope;
  targets: string[];
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  firstOrderOnly: boolean;
  isActive: boolean;
  applyToSets: boolean;
};

export type Coupon = Omit<CouponPayload, 'code'> & {
  code: string;
  id: string;
  createdAt: string;
  usedCount: number;
  confirmedCount: number;
  discountGivenCents: number;
};

export type CouponTargets = {
  categories: string[];
  brands: string[];
  lines: string[];
  products: { handle: string; name: string }[];
};

@Injectable({ providedIn: 'root' })
export class CouponsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/coupons`;

  list(): Promise<Coupon[]> {
    return firstValueFrom(this.http.get<Coupon[]>(this.base));
  }

  targets(): Promise<CouponTargets> {
    return firstValueFrom(this.http.get<CouponTargets>(`${this.base}/targets`));
  }

  create(payload: CouponPayload): Promise<Coupon> {
    return firstValueFrom(this.http.post<Coupon>(this.base, payload));
  }

  update(id: string, payload: Partial<CouponPayload>): Promise<Coupon> {
    return firstValueFrom(this.http.patch<Coupon>(`${this.base}/${id}`, payload));
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/${id}`));
  }
}
