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
  alt: string | null;
  caption: string | null;
  sortOrder: number;
};

export type ProductDetails = {
  size?: string;
  benefits?: string[];
  usage?: string[];
  notes?: string[];
  highlights?: string[];
  family?: string;
  intensity?: string;
  scent?: { name: string; description?: string }[];
  montage?: boolean;
};

export type ProductComponentDto = {
  id: string;
  componentId: string;
  quantity: number;
  component: { id: string; name: string; handle: string; sku: string | null };
};

export type MediaInput = { url: string; kind?: 'image' | 'related'; alt?: string; caption?: string };
export type ComponentInput = { productId: string; quantity: number };

type ProductExtrasPayload = {
  sku?: string | null;
  line?: string | null;
  details?: ProductDetails | null;
  media?: MediaInput[];
  components?: ComponentInput[];
};

export type InventoryRow = {
  productId: string;
  variantId: string | null;
  name: string;
  option: string | null;
  sku: string | null;
  stockUnlimited: boolean;
  stockQty: number | null;
  usedInSets: number;
};

export type InventoryUpdate = { productId: string; variantId?: string; stockQty: number | null };

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
  sku: string | null;
  line: string | null;
  details: ProductDetails | null;
  variants?: ProductVariantDto[];
  media?: ProductMediaDto[];
  components?: ProductComponentDto[];
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

export type CreateProductPayload = ProductExtrasPayload & {
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

export type UpdateProductPayload = ProductExtrasPayload & {
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
  private readonly root = `${environment.apiBaseUrl}/catalog`;

  /** `data` is base64 without the data-URL prefix; the browser resizes before upload. */
  uploadMedia(contentType: 'image/jpeg' | 'image/png' | 'image/webp', data: string): Promise<{ url: string }> {
    return firstValueFrom(this.http.post<{ url: string }>(`${this.root}/media`, { contentType, data }));
  }

  inventory(): Promise<InventoryRow[]> {
    return firstValueFrom(this.http.get<InventoryRow[]>(`${this.root}/inventory`));
  }

  updateInventory(items: InventoryUpdate[]): Promise<InventoryRow[]> {
    return firstValueFrom(this.http.patch<InventoryRow[]>(`${this.root}/inventory`, { items }));
  }

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

  remove(productId: string): Promise<{ deleted: true }> {
    return firstValueFrom(
      this.http.delete<{ deleted: true }>(`${this.base}/${productId}`),
    );
  }

  getById(productId: string): Promise<ProductDto> {
    return firstValueFrom(
      this.http.get<ProductDto>(`${this.base}/${productId}`),
    );
  }
}
