import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const API = 'https://api.cloudflare.com/client/v4';

export type CustomHostnameState = {
  id: string;
  /** pending | active | moved | deleted ... */
  status: string;
  /** initializing | pending_validation | pending_issuance | pending_deployment | active ... */
  sslStatus: string | null;
  /** TXT record Cloudflare asks for when the CNAME alone does not prove ownership. */
  ownershipRecord: { name: string; value: string } | null;
};

type CloudflareHostname = {
  id: string;
  status?: string;
  ssl?: { status?: string };
  ownership_verification?: { type?: string; name?: string; value?: string };
};

/**
 * Cloudflare for SaaS custom hostnames: Cloudflare issues and renews the TLS certificate of each
 * store domain and forwards its traffic to the platform's fallback origin.
 */
@Injectable()
export class CloudflareSaasClient {
  private readonly logger = new Logger(CloudflareSaasClient.name);
  private readonly zoneId: string | null;
  private readonly token: string | null;

  constructor(config: ConfigService) {
    this.zoneId = config.get<string>('CLOUDFLARE_SAAS_ZONE_ID')?.trim() || null;
    this.token = config.get<string>('CLOUDFLARE_SAAS_API_TOKEN')?.trim() || null;
  }

  get configured(): boolean {
    return Boolean(this.zoneId && this.token);
  }

  async create(hostname: string): Promise<CustomHostnameState | null> {
    return this.call('POST', '', {
      hostname,
      ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } },
    });
  }

  async get(id: string): Promise<CustomHostnameState | null> {
    return this.call('GET', `/${encodeURIComponent(id)}`);
  }

  async remove(id: string): Promise<void> {
    await this.call('DELETE', `/${encodeURIComponent(id)}`);
  }

  private async call(method: string, path: string, body?: object): Promise<CustomHostnameState | null> {
    if (!this.zoneId || !this.token) return null;
    try {
      const response = await fetch(`${API}/zones/${this.zoneId}/custom_hostnames${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10_000),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        result?: CloudflareHostname;
        errors?: Array<{ code?: number; message?: string }>;
      };
      if (!response.ok || !payload.success) {
        this.logger.warn(
          `Cloudflare custom hostname ${method} failed: ${payload.errors?.map((e) => e.code).join(',') || response.status}`,
        );
        return null;
      }
      if (method === 'DELETE' || !payload.result) return null;
      const result = payload.result;
      const ownership = result.ownership_verification;
      return {
        id: result.id,
        status: result.status ?? 'pending',
        sslStatus: result.ssl?.status ?? null,
        ownershipRecord:
          ownership?.type === 'txt' && ownership.name && ownership.value
            ? { name: ownership.name, value: ownership.value }
            : null,
      };
    } catch (error) {
      this.logger.warn(`Cloudflare custom hostname ${method} exception: ${(error as Error).name}`);
      return null;
    }
  }
}
