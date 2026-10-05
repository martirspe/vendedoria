import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type LiveSettings = {
  responseMode: 'AUTO' | 'HUMAN_APPROVAL' | 'HUMAN_ONLY';
  reservationSeconds: number;
  maxReservationsPerSession: number;
};
export type TikTokStatus = LiveSettings & {
  enabled: boolean;
  oauthAvailable: boolean;
  connected: boolean;
  healthStatus: string;
  accountId: string | null;
  capabilities: Record<string, 'supported' | 'pending_approval' | 'unsupported'>;
  lastCheckedAt: string | null;
  lastEventAt: string | null;
  errorCode: string | null;
  webhook: { configured: boolean; url: string; events: string[] };
};
export type LiveOffer = {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  regularPriceCents: number;
  livePriceCents: number;
  allocatedStock: number;
  availableStock: number;
  maxPerCustomer: number;
  durationSeconds: number;
  enabled: boolean;
  expiresAt: string | null;
  unitsSold?: number;
};
export type LiveCampaign = {
  id: string;
  name: string;
  status: string;
  mode: string;
  reservationSeconds: number;
  startsAt: string | null;
  endsAt: string | null;
  salesAgentId: string | null;
  products: LiveOffer[];
  sessions: Array<{ id: string; status: string }>;
};
export type LiveCampaignInput = {
  name: string;
  mode: string;
  reservationSeconds: number;
  salesAgentId?: string;
  startsAt?: string;
  endsAt?: string;
  products: Array<{
    productId: string;
    variantId?: string;
    livePriceCents: number;
    allocatedStock: number;
    maxPerCustomer: number;
    durationSeconds: number;
    enabled?: boolean;
  }>;
};
export type LivePanel = {
  id: string;
  campaignId: string;
  name: string;
  status: string;
  currentOfferId: string | null;
  products: LiveOffer[];
  messages: Array<{
    id: string;
    conversationId: string | null;
    intent: string;
    text: string;
    suggestedReply: string | null;
    approvedAt: string | null;
    createdAt: string;
    reservationId: string | null;
  }>;
  reservations: Array<{
    id: string;
    offerId: string;
    quantity: number;
    unitCents: number;
    status: string;
    expiresAt: string;
    orderId: string | null;
    checkoutUrl: string | null;
  }>;
  analytics: {
    messages: number;
    buyIntents: number;
    reservations: number;
    expired: number;
    checkouts: number;
    sales: number;
    revenueCents: number;
    conversionRate: number;
    unitsSold: number;
    soldOut: number;
    revenueByProduct: Record<string, number>;
  };
};

@Injectable({ providedIn: 'root' })
export class LiveApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;
  status(): Promise<TikTokStatus> {
    return firstValueFrom(this.http.get<TikTokStatus>(`${this.base}/integrations/tiktok-live`));
  }
  settings(body: LiveSettings): Promise<TikTokStatus> {
    return firstValueFrom(
      this.http.put<TikTokStatus>(`${this.base}/integrations/tiktok-live`, body),
    );
  }
  connect(): Promise<{ url: string }> {
    return firstValueFrom(
      this.http.post<{ url: string }>(
        `${this.base}/integrations/tiktok-live/connect`,
        {},
        { withCredentials: true },
      ),
    );
  }
  verify(): Promise<TikTokStatus> {
    return firstValueFrom(
      this.http.post<TikTokStatus>(`${this.base}/integrations/tiktok-live/verify`, {}),
    );
  }
  disconnect(): Promise<TikTokStatus> {
    return firstValueFrom(
      this.http.delete<TikTokStatus>(`${this.base}/integrations/tiktok-live/connection`),
    );
  }
  campaigns(): Promise<LiveCampaign[]> {
    return firstValueFrom(this.http.get<LiveCampaign[]>(`${this.base}/live/campaigns`));
  }
  save(body: LiveCampaignInput, id?: string): Promise<{ id: string }> {
    return firstValueFrom(
      id
        ? this.http.put<{ id: string }>(`${this.base}/live/campaigns/${id}`, body)
        : this.http.post<{ id: string }>(`${this.base}/live/campaigns`, body),
    );
  }
  start(id: string): Promise<{ id: string }> {
    return firstValueFrom(
      this.http.post<{ id: string }>(`${this.base}/live/campaigns/${id}/start`, {}),
    );
  }
  panel(id: string): Promise<LivePanel> {
    return firstValueFrom(this.http.get<LivePanel>(`${this.base}/live/sessions/${id}`));
  }
  current(id: string, offerId: string): Promise<LivePanel> {
    return firstValueFrom(
      this.http.patch<LivePanel>(`${this.base}/live/sessions/${id}/current-product`, { offerId }),
    );
  }
  end(id: string): Promise<LivePanel> {
    return firstValueFrom(this.http.post<LivePanel>(`${this.base}/live/sessions/${id}/end`, {}));
  }
  message(
    id: string,
    body: { customerAlias: string; text: string; eventId: string },
  ): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.base}/live/sessions/${id}/messages`, body));
  }
  reserve(
    id: string,
    body: { customerAlias: string; offerId: string; quantity: number; idempotencyKey: string },
  ): Promise<{ id: string; status: string; expiresAt: string; checkoutUrl: string }> {
    return firstValueFrom(
      this.http.post<{ id: string; status: string; expiresAt: string; checkoutUrl: string }>(
        `${this.base}/live/sessions/${id}/reservations`,
        body,
      ),
    );
  }
  approve(id: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.base}/live/messages/${id}/approve`, {}));
  }
  cancel(id: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`${this.base}/live/reservations/${id}`));
  }
}
