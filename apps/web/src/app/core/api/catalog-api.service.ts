import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ProductVariantDto = {
  options?: { name: string; value: string }[] | null;
  priceInherited?: boolean;
  id?: string;
  sku?: string | null;
  option1Name?: string | null;
  option1Value?: string | null;
  option2Name?: string | null;
  option2Value?: string | null;
  option3Name?: string | null;
  option3Value?: string | null;
  imageUrl?: string | null;
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
  useCases?: string[];
  exclusions?: string[];
  compatibility?: string[];
  returns?: string;
  digitalFormat?: string;
  license?: string;
  accessDuration?: string;
  size?: string;
  benefits?: string[];
  usage?: string[];
  notes?: string[];
  highlights?: string[];
  family?: string;
  intensity?: string;
  scent?: { name: string; description?: string }[];
  montage?: boolean;
  attributes?: { name: string; value: string }[];
  audience?: string;
  keywords?: string[];
  contents?: string[];
  warranty?: string;
  faqs?: { question: string; answer: string }[];
  requirements?: string[];
  coverage?: string;
  cancellation?: string;
};

export type ProductComponentDto = {
  id: string;
  componentId: string;
  quantity: number;
  component: { id: string; name: string; handle: string; sku: string | null };
};

export type MediaInput = { url: string; kind?: 'image' | 'related'; alt?: string; caption?: string };
export type ComponentInput = { productId: string; quantity: number };

export type ProductKind = 'PRODUCT' | 'SERVICE' | 'DIGITAL';
export type CatalogAttribute = { key: string; name: string; group?: string; required?: boolean; variant?: boolean; values?: string[]; maxLength?: number };
export type CatalogCategory = { id: string; name: string; kind: ProductKind; parentId: string | null; path: { id: string; name: string }[]; attributes: CatalogAttribute[] };
export type ServiceMode = 'onsite' | 'home' | 'online';

type ProductExtrasPayload = {
  categoryId?: string | null;
  attributeValues?: Record<string, string> | null;
  digitalAccessUrl?: string | null;
  digitalInstructions?: string | null;
  kind?: ProductKind;
  durationMinutes?: number | null;
  serviceMode?: ServiceMode | null;
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
  imageUrl: string | null;
  stockUnlimited: boolean;
  stockQty: number | null;
  usedInSets: number;
};

export type InventoryUpdate = { productId: string; variantId?: string; stockQty: number | null };

export type ProductDto = {
  categoryId?: string | null;
  attributeValues?: Record<string, string> | null;
  digitalAccessUrl: string | null;
  digitalInstructions: string | null;
  id: string;
  handle: string;
  name: string;
  descriptionShort: string | null;
  descriptionFull: string | null;
  categories: string[];
  basePriceCents: number;
  currency: string;
  kind: ProductKind;
  durationMinutes: number | null;
  serviceMode: ServiceMode | null;
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
  expectedStockQty?: number | null;
  options?: { name: string; value: string }[];
  priceInherited?: boolean;
  id?: string;
  sku?: string;
  option1Name?: string;
  option1Value?: string;
  option2Name?: string;
  option2Value?: string;
  option3Name?: string;
  option3Value?: string;
  imageUrl?: string | null;
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
  expectedUpdatedAt?: string;
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

export type CatalogImportOptions = {
  updatePrices: boolean;
  updateStock: boolean;
  fullSync: boolean;
  applyStoreSettings: boolean;
};

export type CatalogImportFile = { path: string; hash: string };

export type CatalogImportPayload = {
  catalog: string;
  files: CatalogImportFile[];
  options: CatalogImportOptions;
};

export type CatalogImportIssue = { level: 'error' | 'warning'; handle: string | null; message: string };

export type CatalogImportReport = {
  source: string | null;
  canImport: boolean;
  summary: {
    products: number;
    create: number;
    update: number;
    sets: number;
    publish: number;
    unpublished: number;
    priceChanges: number;
    stockChanges: number;
    hide: number;
    photos: number;
    uploads: number;
  };
  products: {
    handle: string;
    name: string;
    action: 'create' | 'update';
    isSet: boolean;
    priceCents: number;
    published: boolean;
    photos: number;
    missingPhotos: number;
    priceChange: { from: number; to: number } | null;
    stockChange: { from: number | null; to: number } | null;
  }[];
  hidden: { handle: string; name: string }[];
  store: { available: boolean; changes: string[] };
  plan: { used: number; quota: number | null; after: number };
  issues: CatalogImportIssue[];
  uploads: { hash: string; path: string }[];
};

export type CatalogImportResult = {
  created: number;
  updated: number;
  published: number;
  hidden: number;
  storeUpdated: boolean;
};

@Injectable({ providedIn: 'root' })
export class CatalogApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/catalog/products`;
  private readonly root = `${environment.apiBaseUrl}/catalog`;

  categories(): Promise<CatalogCategory[]> {
    return firstValueFrom(this.http.get<CatalogCategory[]>(`${this.root}/categories`));
  }

  /** `data` is base64 without the data-URL prefix; the browser resizes before upload. */
  uploadMedia(contentType: 'image/jpeg' | 'image/png' | 'image/webp', data: string): Promise<{ url: string }> {
    return firstValueFrom(this.http.post<{ url: string }>(`${this.root}/media`, { contentType, data }));
  }

  previewImport(payload: CatalogImportPayload): Promise<CatalogImportReport> {
    return firstValueFrom(this.http.post<CatalogImportReport>(`${this.root}/import/preview`, payload));
  }

  uploadImportMedia(contentType: 'image/jpeg' | 'image/png' | 'image/webp', data: string): Promise<{ url: string }> {
    return firstValueFrom(this.http.post<{ url: string }>(`${this.root}/import/media`, { contentType, data }));
  }

  commitImport(
    payload: CatalogImportPayload & { uploaded: { hash: string; url: string }[] },
  ): Promise<CatalogImportResult> {
    return firstValueFrom(this.http.post<CatalogImportResult>(`${this.root}/import`, payload));
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
