import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ProductVariantDto = {
  id?: string;
  sku?: string | null;
  option1Name?: string | null;
  option1Value?: string | null;
  option2Name?: string | null;
  option2Value?: string | null;
  priceCents: number;
  isAvailable: boolean;
  stockQty: number | null;
};

export type ProductMediaDto = {
  id: string;
  url: string;
  kind: string;
  sortOrder: number;
};

export type ProductDto = {
  id: string;
  handle: string;
  name: string;
  descriptionShort: string | null;
  descriptionFull: string | null;
  categories: string[];
  basePriceCents: number;
  currency: string;
  isAvailable: boolean;
  stockUnlimited: boolean;
  stockQty: number | null;
  isPublishedOnStore: boolean;
  compareAtPriceCents: number | null;
  brand: string | null;
  variants?: ProductVariantDto[];
  media?: ProductMediaDto[];
  createdAt: string;
  updatedAt: string;
};

export type VariantPayload = {
  sku?: string;
  option1Name?: string;
  option1Value?: string;
  option2Name?: string;
  option2Value?: string;
  priceCents: number;
  isAvailable?: boolean;
  stockQty?: number | null;
};

export type CreateProductPayload = {
  handle: string;
  name: string;
  descriptionShort?: string;
  descriptionFull?: string;
  categories?: string[];
  basePriceCents: number;
  currency?: string;
  isAvailable?: boolean;
  stockUnlimited?: boolean;
  stockQty?: number;
  variants?: VariantPayload[];
  mediaUrls?: string[];
  isPublishedOnStore?: boolean;
  compareAtPriceCents?: number | null;
  brand?: string | null;
};

export type UpdateProductPayload = {
  handle?: string;
  name?: string;
  descriptionShort?: string;
  descriptionFull?: string;
  categories?: string[];
  basePriceCents?: number;
  currency?: string;
  isAvailable?: boolean;
  stockUnlimited?: boolean;
  stockQty?: number | null;
  variants?: VariantPayload[];
  mediaUrls?: string[];
  isPublishedOnStore?: boolean;
  compareAtPriceCents?: number | null;
  brand?: string | null;
};

@Injectable({ providedIn: 'root' })
export class CatalogApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/catalog/products`;

  list(): Promise<ProductDto[]> {
    return firstValueFrom(this.http.get<ProductDto[]>(this.base));
  }

  create(payload: CreateProductPayload): Promise<ProductDto> {
    return firstValueFrom(this.http.post<ProductDto>(this.base, payload));
  }

  update(productId: string, payload: UpdateProductPayload): Promise<ProductDto> {
    return firstValueFrom(
      this.http.patch<ProductDto>(`${this.base}/${productId}`, payload),
    );
  }

  getById(productId: string): Promise<ProductDto> {
    return firstValueFrom(
      this.http.get<ProductDto>(`${this.base}/${productId}`),
    );
  }
}
