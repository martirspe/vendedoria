import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { IntegrationKey } from './billing-api.service';

export type IntegrationState = {
  key: IntegrationKey;
  /** The business turned it on. */
  enabled: boolean;
  /** Working now: on, in the plan and with its required integration active. */
  active: boolean;
  /** The current plan includes it. */
  included: boolean;
  /** The platform can offer it right now. */
  available: boolean;
  /** Cheapest plan that includes it, for the upgrade hint. */
  requiredPlan: { id: string; name: string } | null;
  /** Integration it works on: it is paused while that one is off. */
  requires: IntegrationKey | null;
};

export type CustomDomainStatus = 'none' | 'pending' | 'active' | 'failed';

export type CustomDomainView = {
  domain: string | null;
  status: CustomDomainStatus;
  cnameTarget: string;
  /** TXT record Cloudflare may ask for to prove ownership. */
  ownershipRecord: { name: string; value: string } | null;
  /** Whether the CNAME already points to cnameTarget; null when not checked yet. */
  dnsOk: boolean | null;
  checkedAt: string | null;
  storeUrl: string;
  subdomainUrl: string;
};

export type TrackingSettings = {
  metaPixelId: string | null;
  ga4MeasurementId: string | null;
  active: boolean;
};

export type InstagramStatus = {
  channel: {
    id: string;
    displayName: string | null;
    externalId: string | null;
    healthStatus: 'CONNECTED' | 'DEGRADED' | 'DISCONNECTED' | 'PENDING';
    lastActiveAt: string | null;
    metadata: { accountId: string; username: string | null; hasAccessToken: boolean } | null;
  } | null;
  webhook: {
    callbackUrl: string;
    verifyTokenConfigured: boolean;
    signatureConfigured: boolean;
  };
};

@Injectable({ providedIn: 'root' })
export class IntegrationsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/integrations`;

  list(): Promise<IntegrationState[]> {
    return firstValueFrom(this.http.get<IntegrationState[]>(this.base));
  }

  enable(key: IntegrationKey): Promise<IntegrationState[]> {
    return firstValueFrom(this.http.post<IntegrationState[]>(`${this.base}/${key}/enable`, {}));
  }

  disable(key: IntegrationKey): Promise<IntegrationState[]> {
    return firstValueFrom(this.http.post<IntegrationState[]>(`${this.base}/${key}/disable`, {}));
  }

  getCustomDomain(): Promise<CustomDomainView> {
    return firstValueFrom(this.http.get<CustomDomainView>(`${this.base}/custom-domain`));
  }

  setCustomDomain(domain: string): Promise<CustomDomainView> {
    return firstValueFrom(this.http.put<CustomDomainView>(`${this.base}/custom-domain`, { domain }));
  }

  verifyCustomDomain(): Promise<CustomDomainView> {
    return firstValueFrom(this.http.post<CustomDomainView>(`${this.base}/custom-domain/verify`, {}));
  }

  removeCustomDomain(): Promise<CustomDomainView> {
    return firstValueFrom(this.http.delete<CustomDomainView>(`${this.base}/custom-domain`));
  }

  getTracking(): Promise<TrackingSettings> {
    return firstValueFrom(this.http.get<TrackingSettings>(`${this.base}/tracking`));
  }

  updateTracking(payload: { metaPixelId: string; ga4MeasurementId: string }): Promise<TrackingSettings> {
    return firstValueFrom(this.http.put<TrackingSettings>(`${this.base}/tracking`, payload));
  }

  getInstagram(): Promise<InstagramStatus> {
    return firstValueFrom(this.http.get<InstagramStatus>(`${environment.apiBaseUrl}/channels/instagram`));
  }

  connectInstagram(payload: { accessToken: string; accountId?: string }): Promise<InstagramStatus> {
    return firstValueFrom(
      this.http.post<InstagramStatus>(`${environment.apiBaseUrl}/channels/instagram/connect`, payload),
    );
  }

  disconnectChannel(channelId: string): Promise<unknown> {
    return firstValueFrom(
      this.http.post(`${environment.apiBaseUrl}/channels/${encodeURIComponent(channelId)}/disconnect`, {}),
    );
  }
}
