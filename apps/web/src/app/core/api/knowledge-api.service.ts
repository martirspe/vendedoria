import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type KnowledgeFaqDto = {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  source: 'MANUAL' | 'PASTE_IMPORT';
  reviewStatus: 'DRAFT' | 'APPROVED';
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type JourneyStage = 'DISCOVER' | 'RECOMMEND' | 'CLOSE' | 'SUPPORT';

export type JourneyTemplateDto = {
  id: string;
  title: string;
  stage: JourneyStage;
  scriptText: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

@Injectable({ providedIn: 'root' })
export class KnowledgeApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/knowledge`;

  listFaqs() {
    return firstValueFrom(
      this.http.get<KnowledgeFaqDto[]>(`${this.base}/faqs`),
    );
  }

  createFaq(payload: {
    question: string;
    answer: string;
    tags?: string[];
    isPublished?: boolean;
  }) {
    return firstValueFrom(
      this.http.post<KnowledgeFaqDto>(`${this.base}/faqs`, payload),
    );
  }

  updateFaq(
    faqId: string,
    payload: Partial<{
      question: string;
      answer: string;
      tags: string[];
      isPublished: boolean;
      reviewStatus: 'DRAFT' | 'APPROVED';
    }>,
  ) {
    return firstValueFrom(
      this.http.patch<KnowledgeFaqDto>(`${this.base}/faqs/${faqId}`, payload),
    );
  }

  approveFaq(faqId: string) {
    return firstValueFrom(
      this.http.post<KnowledgeFaqDto>(
        `${this.base}/faqs/${faqId}/approve`,
        {},
      ),
    );
  }

  deleteFaq(faqId: string) {
    return firstValueFrom(
      this.http.delete<{ ok: boolean }>(`${this.base}/faqs/${faqId}`),
    );
  }

  importPaste(rawText: string) {
    return firstValueFrom(
      this.http.post<{ created: KnowledgeFaqDto[]; skipped: boolean }>(
        `${this.base}/faqs/import-paste`,
        { rawText },
      ),
    );
  }

  listJourneys() {
    return firstValueFrom(
      this.http.get<JourneyTemplateDto[]>(`${this.base}/journeys`),
    );
  }

  createJourney(payload: {
    title: string;
    stage: JourneyStage;
    scriptText: string;
    isActive?: boolean;
  }) {
    return firstValueFrom(
      this.http.post<JourneyTemplateDto>(`${this.base}/journeys`, payload),
    );
  }

  updateJourney(
    journeyId: string,
    payload: Partial<{
      title: string;
      stage: JourneyStage;
      scriptText: string;
      isActive: boolean;
    }>,
  ) {
    return firstValueFrom(
      this.http.patch<JourneyTemplateDto>(
        `${this.base}/journeys/${journeyId}`,
        payload,
      ),
    );
  }

  deleteJourney(journeyId: string) {
    return firstValueFrom(
      this.http.delete<{ ok: boolean }>(`${this.base}/journeys/${journeyId}`),
    );
  }
}
