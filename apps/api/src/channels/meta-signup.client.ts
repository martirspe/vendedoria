import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

export type AuthorizedWhatsAppPhone = {
  id: string;
  wabaId: string;
  displayName: string;
  displayPhoneNumber: string;
  coexistence: boolean;
  registered: boolean;
};
type DebugToken = {
  data?: {
    app_id?: string; is_valid?: boolean; expires_at?: number; data_access_expires_at?: number;
    scopes?: string[]; granular_scopes?: Array<{ scope: string; target_ids?: string[] }>;
  };
};

export class MetaAuthorizationExpiredException extends BadRequestException {
  constructor() { super('La autorización de Meta venció o fue revocada. Vuelve a conectar WhatsApp.'); }
}

@Injectable()
export class MetaSignupClient {
  constructor(private readonly config: ConfigService) {}

  get version(): string { return this.config.get<string>('META_GRAPH_VERSION') || 'v26.0'; }
  get appId(): string { return this.config.get<string>('META_APP_ID') || ''; }

  forApp(appId: string, appSecret: string): MetaSignupClient {
    return new MetaSignupClient(new ConfigService({ META_APP_ID: appId, META_APP_SECRET: appSecret, META_GRAPH_VERSION: this.version }));
  }

  async exchange(code: string): Promise<string> {
    const result = await this.request<{ access_token?: string }>('oauth/access_token', undefined, 'POST', {
      client_id: this.appId, client_secret: this.secret(), code,
    }, undefined, true);
    if (!result.access_token) throw new BadRequestException('Meta no completó la autorización. Vuelve a conectar WhatsApp.');
    return result.access_token;
  }

  async authorizedPhones(token: string): Promise<AuthorizedWhatsAppPhone[]> {
    const info = await this.authorization(token);
    const targets = info.granular_scopes?.find(scope => scope.scope === 'whatsapp_business_management')?.target_ids || [];
    if (!targets.length || targets.length > 20) throw new BadRequestException('Selecciona una cuenta de WhatsApp en Meta y vuelve a intentarlo.');
    const phones: AuthorizedWhatsAppPhone[] = [];
    for (const wabaId of targets) {
      if (/^\d+$/.test(wabaId)) phones.push(...await this.phones(wabaId, token));
    }
    return phones;
  }

  async ownPhone(token: string, wabaId: string, phoneId: string): Promise<AuthorizedWhatsAppPhone> {
    await this.authorization(token);
    const phone = (await this.phones(wabaId, token)).find(item => item.id === phoneId);
    if (!phone) throw new BadRequestException('El número no pertenece a la cuenta de WhatsApp indicada o el token no tiene acceso.');
    return phone;
  }

  async webhookConfigured(callbackUrl: string): Promise<boolean> {
    const subscriptions = await this.list<{ object?: string; callback_url?: string; active?: boolean; fields?: Array<{ name?: string }> }>(`${this.appId}/subscriptions`, `${this.appId}|${this.secret()}`);
    return subscriptions.some(item => item.object === 'whatsapp_business_account' && item.callback_url === callbackUrl && item.active === true && item.fields?.some(field => field.name === 'messages'));
  }

  private async authorization(token: string) {
    const debug = await this.request<DebugToken>('debug_token', `${this.appId}|${this.secret()}`, 'GET', undefined, { input_token: token });
    const info = debug.data;
    if (!info?.is_valid || info.app_id !== this.appId ||
      (info.expires_at && info.expires_at <= Date.now() / 1000) ||
      (info.data_access_expires_at && info.data_access_expires_at <= Date.now() / 1000) ||
      !['whatsapp_business_management', 'whatsapp_business_messaging'].every(scope => info.scopes?.includes(scope))) {
      throw new BadRequestException('Autoriza la administración y mensajería de WhatsApp para completar la conexión.');
    }
    return info;
  }

  private async phones(wabaId: string, token: string): Promise<AuthorizedWhatsAppPhone[]> {
      const rows = await this.list<{
        id: string; verified_name?: string; display_phone_number?: string; is_on_biz_app?: boolean; platform_type?: string; status?: string;
      }>(`${wabaId}/phone_numbers`, token, 'id,verified_name,display_phone_number,is_on_biz_app,platform_type,status');
      return rows.map(phone => ({
        id: phone.id, wabaId, displayName: phone.verified_name || 'WhatsApp Business',
        displayPhoneNumber: phone.display_phone_number || '', coexistence: phone.is_on_biz_app === true,
        registered: phone.platform_type === 'CLOUD_API' && phone.status === 'CONNECTED',
      }));
  }

  async register(phoneId: string, token: string, pin: string): Promise<void> {
    await this.success(`${phoneId}/register`, token, 'POST', { messaging_product: 'whatsapp', pin });
  }
  async subscribe(wabaId: string, token: string): Promise<void> {
    await this.success(`${wabaId}/subscribed_apps`, token, 'POST');
  }
  async unsubscribe(wabaId: string, token: string): Promise<void> {
    await this.success(`${wabaId}/subscribed_apps`, token, 'DELETE');
  }
  async subscribed(wabaId: string, token: string): Promise<boolean> {
    const apps = await this.list<{ whatsapp_business_api_data?: { id?: string }; id?: string }>(`${wabaId}/subscribed_apps`, token);
    return apps.some(app => (app.whatsapp_business_api_data?.id || app.id) === this.appId);
  }
  private async success(path: string, token: string, method: string, body?: Record<string, string>) {
    const response = await this.request<{ success?: boolean }>(path, token, method, body);
    if (response.success !== true) throw new BadRequestException('Meta no completó la operación. Revisa tu cuenta y vuelve a intentarlo.');
  }
  private async list<T>(path: string, token: string, fields?: string): Promise<T[]> {
    const rows: T[] = [];
    let after: string | undefined;
    for (let page = 0; page < 10; page++) {
      const result = await this.request<{ data?: T[]; paging?: { next?: string; cursors?: { after?: string } } }>(
        path, token, 'GET', undefined, { limit: '100', ...(fields ? { fields } : {}), ...(after ? { after } : {}) },
      );
      if (!Array.isArray(result.data)) throw new BadRequestException('No pudimos consultar tu cuenta de WhatsApp.');
      rows.push(...result.data);
      if (!result.paging?.next) return rows;
      after = result.paging.cursors?.after;
      if (!after) break;
    }
    throw new BadRequestException('La cuenta contiene demasiados activos. Contacta con soporte.');
  }

  private secret(): string { return this.config.get<string>('META_APP_SECRET') || ''; }
  private async request<T>(path: string, token?: string, method = 'GET', body?: Record<string, string>, query?: Record<string, string>, form = false): Promise<T> {
    const url = new URL(`https://graph.facebook.com/${this.version}/${path}`);
    for (const [key, value] of Object.entries(query || {})) url.searchParams.set(key, value);
    if (token && !token.includes('|')) url.searchParams.set('appsecret_proof', createHmac('sha256', this.secret()).update(token).digest('hex'));
    let response: Response;
    try {
      response = await fetch(url, {
        method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' } : {}) },
        body: body ? (form ? new URLSearchParams(body).toString() : JSON.stringify(body)) : undefined, signal: AbortSignal.timeout(15000), redirect: 'error',
      });
    } catch { throw new ServiceUnavailableException('Meta no respondió. Inténtalo de nuevo en unos minutos.'); }
    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) throw new ServiceUnavailableException('Meta no está disponible. Inténtalo de nuevo en unos minutos.');
      let code: number | undefined;
      try { code = ((await response.json()) as { error?: { code?: number } }).error?.code; } catch { /* Never expose upstream body. */ }
      if (response.status === 401 || code === 190) throw new MetaAuthorizationExpiredException();
      throw new BadRequestException('Meta rechazó la operación. Revisa los permisos, el número y el PIN, y vuelve a conectar WhatsApp.');
    }
    try { return await response.json() as T; }
    catch { throw new ServiceUnavailableException('Meta devolvió una respuesta incompleta. Inténtalo de nuevo.'); }
  }
}
