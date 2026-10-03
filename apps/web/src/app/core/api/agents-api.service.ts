import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type AgentQuality = {
  score: number;
  max: number;
  completedFields: number;
  totalFields: number;
  missingHints: string[];
};

export type SalesAgentDto = {
  id: string;
  tenantId: string;
  name: string;
  companyName: string | null;
  companyDescription: string | null;
  audienceDescription: string | null;
  rulesText: string | null;
  communicationStyle: string | null;
  salesStyle: string | null;
  responseLength: string;
  useEmojis: boolean;
  emojiPalette: string | null;
  wordsToAvoid: string | null;
  initialMessage: string | null;
  purchaseConfirmMessage: string | null;
  handoffMessage: string | null;
  pauseOnHandoff: boolean;
  neverOfferDiscount: boolean;
  neverInventShipping: boolean;
  catalogOnlyFacts: boolean;
  salesTechniques: string[];
  objectionHandling: string | null;
  promptMode: SalesAgentPromptMode;
  customPrompt: string | null;
  isActive: boolean;
  isPrimary: boolean;
  channelIds: string[];
  quality: AgentQuality;
};

export type SalesAgentPromptMode = 'guided' | 'custom';

export type SalesAgentSummaryDto = {
  id: string;
  name: string;
  isActive: boolean;
  promptMode: SalesAgentPromptMode;
  isPrimary: boolean;
  channelIds: string[];
};

export type SalesAgentPromptDto = {
  guidedPersona: string;
  effectivePrompt: string;
};

export type UpdateSalesAgentPayload = Partial<{
  name: string;
  companyName: string;
  companyDescription: string;
  audienceDescription: string;
  rulesText: string;
  communicationStyle: string;
  salesStyle: string;
  responseLength: 'concise' | 'balanced' | 'detailed';
  useEmojis: boolean;
  emojiPalette: string;
  wordsToAvoid: string;
  initialMessage: string;
  purchaseConfirmMessage: string;
  handoffMessage: string;
  pauseOnHandoff: boolean;
  neverOfferDiscount: boolean;
  neverInventShipping: boolean;
  catalogOnlyFacts: boolean;
  salesTechniques: string[];
  objectionHandling: string;
  promptMode: SalesAgentPromptMode;
  customPrompt: string;
  isActive: boolean;
}>;

export type AgentToolTrace = {
  name: string;
  status: 'ok' | 'error' | 'skipped';
  summary: string;
  data?: Record<string, unknown>;
};

export type PlaygroundMessageDto = {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  authorType: 'BUYER' | 'SALES_AGENT' | 'HUMAN_OPERATOR' | 'SYSTEM';
  body: string;
  toolTraces: AgentToolTrace[] | null;
  createdAt: string;
};

export type PlaygroundSessionDto = {
  id: string;
  tenantId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: PlaygroundMessageDto[];
};

export type PlaygroundSendResult = {
  session: PlaygroundSessionDto;
  lastAgentReply: {
    replyText: string;
    escalate: boolean;
    usedCatalog: boolean;
    tools: AgentToolTrace[];
    orderId?: string;
    checkoutUrl?: string;
    dryRun: boolean;
  };
};

@Injectable({ providedIn: 'root' })
export class AgentsApiService {
  private readonly http = inject(HttpClient);

  getPrimary() {
    return firstValueFrom(
      this.http.get<SalesAgentDto>(`${environment.apiBaseUrl}/agents/primary`),
    );
  }

  list() {
    return firstValueFrom(
      this.http.get<SalesAgentSummaryDto[]>(`${environment.apiBaseUrl}/agents`),
    );
  }

  get(id: string) {
    return firstValueFrom(
      this.http.get<SalesAgentDto>(`${environment.apiBaseUrl}/agents/${id}`),
    );
  }

  create(payload: { name: string; copyFromId?: string }) {
    return firstValueFrom(
      this.http.post<SalesAgentDto>(`${environment.apiBaseUrl}/agents`, payload),
    );
  }

  update(id: string, payload: UpdateSalesAgentPayload) {
    return firstValueFrom(
      this.http.patch<SalesAgentDto>(
        `${environment.apiBaseUrl}/agents/${id}`,
        payload,
      ),
    );
  }

  remove(id: string) {
    return firstValueFrom(
      this.http.delete<{ deleted: boolean }>(`${environment.apiBaseUrl}/agents/${id}`),
    );
  }

  assignChannels(id: string, channelIds: string[]) {
    return firstValueFrom(
      this.http.put<SalesAgentDto>(
        `${environment.apiBaseUrl}/agents/${id}/channels`,
        { channelIds },
      ),
    );
  }

  getPrompt(id: string) {
    return firstValueFrom(
      this.http.get<SalesAgentPromptDto>(
        `${environment.apiBaseUrl}/agents/${id}/prompt`,
      ),
    );
  }

  getPlaygroundSession() {
    return firstValueFrom(
      this.http.get<PlaygroundSessionDto>(
        `${environment.apiBaseUrl}/agents/playground/session`,
      ),
    );
  }

  resetPlaygroundSession(sessionId: string) {
    return firstValueFrom(
      this.http.post<PlaygroundSessionDto>(
        `${environment.apiBaseUrl}/agents/playground/sessions/${sessionId}/reset`,
        {},
      ),
    );
  }

  sendPlaygroundMessage(sessionId: string, text: string, agentId?: string) {
    return firstValueFrom(
      this.http.post<PlaygroundSendResult>(
        `${environment.apiBaseUrl}/agents/playground/sessions/${sessionId}/messages`,
        { text, agentId },
      ),
    );
  }
}
