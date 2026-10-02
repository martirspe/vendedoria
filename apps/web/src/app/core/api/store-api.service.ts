import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { StorefrontStatus } from '@vendedoria/contracts';
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
};

export type StoreChecklistItem = {
  id: 'name' | 'whatsapp' | 'products' | 'logo' | 'email' | 'seo';
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
}>;

@Injectable({ providedIn: 'root' })
export class StoreApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/store`;

  get(): Promise<StoreSettingsView> {
    return firstValueFrom(this.http.get<StoreSettingsView>(this.base));
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
