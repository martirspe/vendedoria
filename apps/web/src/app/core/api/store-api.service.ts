import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  StoreTemplate,
  StoreTemplateCopy,
  StorefrontStatus,
  UbigeoDistrict,
} from '@vendedoria/contracts';
import { environment } from '../../../environments/environment';

export type StorefrontDto = {
  id: string;
  status: StorefrontStatus;
  displayName: string;
  tagline: string | null;
  logoUrl: string | null;
  heroImageUrl: string | null;
  brandColor: string;
  accentColor: string;
  whatsappPhone: string | null;
  contactEmail: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  legalName: string | null;
  ruc: string | null;
  legalAddress: string | null;
  complaintsBookUrl: string | null;
  dataBankCode: string | null;
  exchangeDays: number;
  deliveryEnabled: boolean;
  freeShippingFromCents: number | null;
  pickupEnabled: boolean;
  pickupAddress: string | null;
  shippingOriginUbigeo: string | null;
  carrierRates: CarrierRates | null;
  industry: StoreIndustry;
  template: StoreTemplate;
  templateCopy: StoreTemplateCopy | null;
};

export type StoreIndustry =
  | 'general'
  | 'belleza'
  | 'moda'
  | 'hogar'
  | 'alimentos'
  | 'tecnologia'
  | 'salud'
  | 'mascotas'
  | 'otros';

/** Five rates in cents, from the nearest distance tier to the farthest. */
export type CarrierRates = { olva?: number[]; shalom?: number[] };

export type StoreChecklistItem = {
  id:
    | 'name'
    | 'whatsapp'
    | 'products'
    | 'legal'
    | 'complaints'
    | 'email'
    | 'delivery'
    | 'logo'
    | 'seo';
  label: string;
  done: boolean;
  required: boolean;
  impact: string;
};

export type StoreSettingsView = {
  storefront: StorefrontDto;
  url: string;
  totalProducts: number;
  publishedProducts: number;
  availableProducts: number;
  checklist: StoreChecklistItem[];
  canPublish: boolean;
};

export type UpdateStorePayload = Partial<{
  displayName: string;
  tagline: string | null;
  logoUrl: string | null;
  heroImageUrl: string | null;
  brandColor: string;
  accentColor: string;
  whatsappPhone: string | null;
  contactEmail: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  legalName: string | null;
  ruc: string | null;
  legalAddress: string | null;
  complaintsBookUrl: string | null;
  dataBankCode: string | null;
  exchangeDays: number;
  deliveryEnabled: boolean;
  freeShippingFromCents: number | null;
  pickupEnabled: boolean;
  pickupAddress: string | null;
  shippingOriginUbigeo: string | null;
  carrierRates: CarrierRates | null;
  industry: StoreIndustry;
  template: StoreTemplate;
  templateCopy: StoreTemplateCopy | null;
}>;

@Injectable({ providedIn: 'root' })
export class StoreApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/store`;

  get(): Promise<StoreSettingsView> {
    return firstValueFrom(this.http.get<StoreSettingsView>(this.base));
  }

  ubigeos(): Promise<UbigeoDistrict[]> {
    return firstValueFrom(this.http.get<UbigeoDistrict[]>(`${this.base}/ubigeos`));
  }

  update(payload: UpdateStorePayload): Promise<StoreSettingsView> {
    return firstValueFrom(this.http.patch<StoreSettingsView>(this.base, payload));
  }

  publish(): Promise<StoreSettingsView> {
    return firstValueFrom(this.http.post<StoreSettingsView>(`${this.base}/publish`, {}));
  }

  unpublish(): Promise<StoreSettingsView> {
    return firstValueFrom(this.http.post<StoreSettingsView>(`${this.base}/unpublish`, {}));
  }

  showAvailableProducts(): Promise<StoreSettingsView> {
    return firstValueFrom(
      this.http.post<StoreSettingsView>(`${this.base}/products/show-available`, {}),
    );
  }

  previewLink(): Promise<{ url: string; expiresAt: string }> {
    return firstValueFrom(
      this.http.post<{ url: string; expiresAt: string }>(`${this.base}/preview-link`, {}),
    );
  }
}
