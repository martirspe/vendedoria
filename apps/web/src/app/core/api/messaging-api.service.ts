import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ChannelDto = {
  id: string;
  type: 'WHATSAPP' | 'INSTAGRAM' | 'TIKTOK_LIVE';
  connectionMode: string | null;
  healthStatus: 'CONNECTED' | 'DEGRADED' | 'DISCONNECTED' | 'PENDING';
  externalId: string | null;
  displayName: string | null;
  lastActiveAt: string | null;
  metadata: { phoneNumberId?: string; hasAccessToken?: boolean; wabaId?: string; onboarding?: 'MANUAL' | 'EMBEDDED_SIGNUP' | 'LEGACY' } | null;
};

export type ConversationListItem = {
  id: string;
  contactName: string | null;
  contactPhone: string | null;
  status: string;
  agentEnabled: boolean;
  markedAsSale: boolean;
  markedUnattended: boolean;
  updatedAt: string;
  channel: {
    id: string;
    type: string;
    healthStatus: string;
    displayName: string | null;
  };
  messages: Array<{ body: string; createdAt: string; authorType: string }>;
};

export type AgentToolTrace = {
  name: string;
  status: 'ok' | 'error' | 'skipped';
  summary: string;
  data?: Record<string, unknown>;
};

export type MessageMetadata = {
  tools?: AgentToolTrace[];
  usedCatalog?: boolean;
  escalate?: boolean;
  orderId?: string | null;
  checkoutUrl?: string | null;
  /** `image`: product photo sent by the agent; the body holds its caption. */
  kind?: 'image';
  imageUrl?: string;
  productId?: string;
};

export type ConversationDetail = ConversationListItem & {
  messages: Array<{
    id: string;
    body: string;
    createdAt: string;
    direction: string;
    authorType: string;
    metadata?: MessageMetadata | null;
  }>;
  messagingWindow: {
    canSendFreeForm: boolean;
    closesAt: string | null;
    reason: string | null;
  };
  linkedOrder: {
    id: string;
    status: string;
    totalCents: number;
    currency: string;
    itemCount: number;
    paymentStatus: string | null;
    checkoutUrl: string | null;
    updatedAt: string;
  } | null;
};

export type ChannelDiagnostics = {
  connected: boolean;
  healthStatus: 'CONNECTED' | 'DEGRADED' | 'DISCONNECTED' | 'PENDING';
  channel?: {
    id: string;
    displayName: string | null;
    externalId: string | null;
    connectionMode: string | null;
    lastActiveAt: string | null;
  };
  checks: Array<{
    id: string;
    label: string;
    status: 'ok' | 'warn' | 'error';
    detail: string;
  }>;
  nextSteps: string[];
};

export type WhatsAppSignupConfiguration = { available: boolean; manualAvailable: boolean; canManage: boolean; appId: string | null; graphVersion: string; message: string | null };
export type WhatsAppManualCredentials = { appId: string; appSecret: string; accessToken: string; wabaId: string; phoneNumberId: string };
export type WhatsAppManualWebhook = { callbackUrl: string; verifyToken: string; verified: boolean };
export type WhatsAppSignupSession = { sessionId: string; state: string; expiresAt: string; configId: string; appId: string; graphVersion: string };
export type AuthorizedWhatsAppPhone = { id: string; wabaId: string; displayName: string; displayPhoneNumber: string; coexistence: boolean; registered: boolean };

@Injectable({ providedIn: 'root' })
export class MessagingApiService {
  private readonly http = inject(HttpClient);

  listChannels() {
    return firstValueFrom(
      this.http.get<ChannelDto[]>(`${environment.apiBaseUrl}/channels`),
    );
  }

  getWhatsAppDiagnostics() {
    return firstValueFrom(
      this.http.get<ChannelDiagnostics>(
        `${environment.apiBaseUrl}/channels/whatsapp/diagnostics`,
      ),
    );
  }

  getWhatsAppSignupConfiguration() {
    return firstValueFrom(this.http.get<WhatsAppSignupConfiguration>(`${environment.apiBaseUrl}/channels/whatsapp/signup/config`));
  }
  connectWhatsAppManual(credentials: WhatsAppManualCredentials) {
    return firstValueFrom(this.http.post<{ channel: ChannelDto; webhook: WhatsAppManualWebhook }>(`${environment.apiBaseUrl}/channels/whatsapp/manual/connect`, credentials));
  }
  getWhatsAppManualSetup(channelId: string) {
    return firstValueFrom(this.http.get<WhatsAppManualWebhook>(`${environment.apiBaseUrl}/channels/whatsapp/manual/${encodeURIComponent(channelId)}/setup`));
  }
  activateWhatsAppManual(channelId: string) {
    return firstValueFrom(this.http.post<{ channel: ChannelDto }>(`${environment.apiBaseUrl}/channels/whatsapp/manual/${encodeURIComponent(channelId)}/activate`, {}));
  }
  startWhatsAppSignup() {
    return firstValueFrom(this.http.post<WhatsAppSignupSession>(`${environment.apiBaseUrl}/channels/whatsapp/signup/start`, {}));
  }
  authorizeWhatsAppSignup(session: WhatsAppSignupSession, code: string) {
    return firstValueFrom(this.http.post<{ phones: AuthorizedWhatsAppPhone[] }>(`${environment.apiBaseUrl}/channels/whatsapp/signup/authorize`, { sessionId: session.sessionId, state: session.state, code }));
  }
  completeWhatsAppSignup(session: WhatsAppSignupSession, phone: AuthorizedWhatsAppPhone, pin?: string) {
    return firstValueFrom(this.http.post<{ channel: ChannelDto }>(`${environment.apiBaseUrl}/channels/whatsapp/signup/complete`, { sessionId: session.sessionId, state: session.state, phoneNumberId: phone.id, wabaId: phone.wabaId, ...(pin ? { pin } : {}) }));
  }
  cancelWhatsAppSignup(session: WhatsAppSignupSession) {
    return firstValueFrom(this.http.post(`${environment.apiBaseUrl}/channels/whatsapp/signup/cancel`, { sessionId: session.sessionId, state: session.state }));
  }
  disconnectWhatsApp(channelId: string) {
    return firstValueFrom(this.http.post(`${environment.apiBaseUrl}/channels/whatsapp/${encodeURIComponent(channelId)}/disconnect`, {}));
  }

  simulateInbound(payload: {
    fromPhone: string;
    text: string;
    contactName?: string;
  }) {
    return firstValueFrom(
      this.http.post(
        `${environment.apiBaseUrl}/channels/whatsapp/simulate-inbound`,
        payload,
      ),
    );
  }

  listConversations(filters?: {
    q?: string;
    unattended?: boolean;
    salesOnly?: boolean;
    channelType?: string;
  }) {
    let params = new HttpParams();
    if (filters?.q) params = params.set('q', filters.q);
    if (filters?.unattended) params = params.set('unattended', 'true');
    if (filters?.salesOnly) params = params.set('salesOnly', 'true');
    if (filters?.channelType)
      params = params.set('channelType', filters.channelType);
    return firstValueFrom(
      this.http.get<ConversationListItem[]>(
        `${environment.apiBaseUrl}/conversations`,
        { params },
      ),
    );
  }

  getConversation(id: string) {
    return firstValueFrom(
      this.http.get<ConversationDetail>(
        `${environment.apiBaseUrl}/conversations/${id}`,
      ),
    );
  }

  updateConversation(
    id: string,
    payload: {
      agentEnabled?: boolean;
      markedAsSale?: boolean;
      markedUnattended?: boolean;
    },
  ) {
    return firstValueFrom(
      this.http.patch(`${environment.apiBaseUrl}/conversations/${id}`, payload),
    );
  }

  sendMessage(id: string, text: string) {
    return firstValueFrom(
      this.http.post<{
        message: unknown;
        notice: string;
      }>(`${environment.apiBaseUrl}/conversations/${id}/messages`, { text }),
    );
  }

  listTemplates() {
    return firstValueFrom(
      this.http.get<
        Array<{
          id: string;
          name: string;
          language: string;
          category: string;
          body: string;
          description: string;
        }>
      >(`${environment.apiBaseUrl}/conversations/templates`),
    );
  }

  sendTemplate(
    conversationId: string,
    payload: { templateId: string; variables?: string[] },
  ) {
    return firstValueFrom(
      this.http.post<{
        message: unknown;
        notice: string;
        dryRun?: boolean;
      }>(
        `${environment.apiBaseUrl}/conversations/${conversationId}/templates`,
        payload,
      ),
    );
  }
}
