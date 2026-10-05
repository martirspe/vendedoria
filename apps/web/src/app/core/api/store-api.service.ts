import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  StoreEditorSection,
  StoreEditorTheme,
  StoreTemplate,
  StoreTemplateContent,
  StorefrontStatus,
} from '@vendedoria/contracts';
import { environment } from '../../../environments/environment';

/** BUSINESS has RUC; INDIVIDUAL sells without RUC and its DNI is never shown in the store. */
export type SellerType = 'BUSINESS' | 'INDIVIDUAL';

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
  sellerType: SellerType;
  legalName: string | null;
  ruc: string | null;
  legalAddress: string | null;
  dni: string | null;
  legalDistrict: string | null;
  complaintsBookUrl: string | null;
  dataBankCode: string | null;
  exchangeDays: number;
  industry: StoreIndustry;
  template: StoreTemplate;
};

export type StoreEditorState = {
  /** Draft being edited, or the published content when there are no pending changes. */
  content: StoreTemplateContent;
  hasUnpublishedChanges: boolean;
  /** The draft is published automatically at this time. */
  scheduledAt: string | null;
  savedAt: string;
};

/** Design that was published until `replacedAt`. */
export type StoreEditorVersion = { id: string; replacedAt: string };

export type StoreEditorView = StoreEditorState & {
  template: StoreTemplate;
  sections: StoreEditorSection[];
  theme: StoreEditorTheme;
  storeStatus: StorefrontStatus;
  /** Store home in edit mode; valid until `frameExpiresAt`. */
  frameUrl: string;
  frameExpiresAt: string;
  /** Texts can be drafted with AI. */
  aiText: boolean;
};

export type StoreTextAiAction = 'write' | 'shorter' | 'persuasive' | 'friendly' | 'fix';

/** A home page written by AI: texts per built-in section and library blocks in order. */
export type StorePageAi = {
  sections: Record<string, Record<string, string>>;
  blocks: { type: string; texts: Record<string, string> }[];
};

export type StoreTextAiRequest = {
  section: string;
  field: string;
  action: StoreTextAiAction;
  current?: string;
  instruction?: string;
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
  availability: { public: boolean; previewAllowed: boolean; reason: 'published' | 'draft' | 'suspended' | 'integration_inactive' };
  storefront: StorefrontDto;
  url: string;
  templateDemoBaseUrl: string;
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
  sellerType: SellerType;
  legalName: string | null;
  ruc: string | null;
  legalAddress: string | null;
  dni: string | null;
  legalDistrict: string | null;
  complaintsBookUrl: string | null;
  dataBankCode: string | null;
  exchangeDays: number;
  industry: StoreIndustry;
  template: StoreTemplate;
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

  /** Moves the store to a new subdomain; the previous one redirects to it. */
  changeSubdomain(slug: string): Promise<StoreSettingsView> {
    return firstValueFrom(this.http.patch<StoreSettingsView>(`${this.base}/subdomain`, { slug }));
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

  editor(): Promise<StoreEditorView> {
    return firstValueFrom(this.http.get<StoreEditorView>(`${this.base}/editor`));
  }

  saveDraft(content: StoreTemplateContent): Promise<StoreEditorState> {
    return firstValueFrom(this.http.put<StoreEditorState>(`${this.base}/editor/draft`, { content }));
  }

  publishDraft(): Promise<StoreEditorState> {
    return firstValueFrom(this.http.post<StoreEditorState>(`${this.base}/editor/publish`, {}));
  }

  discardDraft(): Promise<StoreEditorState> {
    return firstValueFrom(this.http.post<StoreEditorState>(`${this.base}/editor/discard`, {}));
  }

  scheduleDraft(publishAt: string): Promise<StoreEditorState> {
    return firstValueFrom(this.http.put<StoreEditorState>(`${this.base}/editor/schedule`, { publishAt }));
  }

  cancelSchedule(): Promise<StoreEditorState> {
    return firstValueFrom(this.http.delete<StoreEditorState>(`${this.base}/editor/schedule`));
  }

  editorVersions(): Promise<StoreEditorVersion[]> {
    return firstValueFrom(this.http.get<StoreEditorVersion[]>(`${this.base}/editor/versions`));
  }

  restoreVersion(id: string): Promise<StoreEditorState> {
    return firstValueFrom(
      this.http.post<StoreEditorState>(`${this.base}/editor/versions/${encodeURIComponent(id)}/restore`, {}),
    );
  }

  suggestText(request: StoreTextAiRequest): Promise<{ suggestions: string[] }> {
    return firstValueFrom(this.http.post<{ suggestions: string[] }>(`${this.base}/editor/ai/text`, request));
  }

  /** A library block type and its texts written from the merchant's request. */
  suggestSection(prompt: string): Promise<{ type: string; texts: Record<string, string> }> {
    return firstValueFrom(
      this.http.post<{ type: string; texts: Record<string, string> }>(`${this.base}/editor/ai/section`, { prompt }),
    );
  }

  /** Texts of the built-in home sections and a few blocks, written from the merchant's request. */
  suggestPage(prompt: string): Promise<StorePageAi> {
    return firstValueFrom(this.http.post<StorePageAi>(`${this.base}/editor/ai/page`, { prompt }));
  }

  /** An ambiance photo for an image field, already saved as an upload of the business. */
  suggestImage(request: { section: string; field: string; instruction?: string }): Promise<{ url: string }> {
    return firstValueFrom(this.http.post<{ url: string }>(`${this.base}/editor/ai/image`, request));
  }
}
