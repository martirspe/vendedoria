import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ChannelDto = {
  id: string;
  type: 'WHATSAPP' | 'INSTAGRAM';
  connectionMode: string | null;
  healthStatus: 'CONNECTED' | 'DEGRADED' | 'DISCONNECTED' | 'PENDING';
  externalId: string | null;
  displayName: string | null;
  lastActiveAt: string | null;
  metadata: { phoneNumberId?: string; hasAccessToken?: boolean } | null;
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

  connectWhatsApp(payload: {
    phoneNumberId: string;
    accessToken: string;
    displayName?: string;
    connectionMode?: string;
  }) {
    return firstValueFrom(
      this.http.post<{
        channel: ChannelDto;
        webhook: {
          callbackUrl: string;
          verifyTokenConfigured: boolean;
          verifyTokenHint: string;
        };
      }>(`${environment.apiBaseUrl}/channels/whatsapp/connect`, payload),
    );
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
