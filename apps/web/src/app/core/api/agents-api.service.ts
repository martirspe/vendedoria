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
  isActive: boolean;
  quality: AgentQuality;
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
  isActive: boolean;
}>;

@Injectable({ providedIn: 'root' })
export class AgentsApiService {
  private readonly http = inject(HttpClient);

  getPrimary() {
    return firstValueFrom(
      this.http.get<SalesAgentDto>(`${environment.apiBaseUrl}/agents/primary`),
    );
  }

  updatePrimary(payload: UpdateSalesAgentPayload) {
    return firstValueFrom(
      this.http.patch<SalesAgentDto>(
        `${environment.apiBaseUrl}/agents/primary`,
        payload,
      ),
    );
  }
}
