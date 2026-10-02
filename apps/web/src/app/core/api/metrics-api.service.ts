import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type MetricsSummary = {
  periodDays: number;
  from: string;
  to: string;
  currency: string;
  conversations: number;
  inboundMessages: number;
  agentMessages: number;
  ordersCreated: number;
  paidOrders: number;
  revenueCents: number;
  conversionRate: number;
  unattendedOpen: number;
};

@Injectable({ providedIn: 'root' })
export class MetricsApiService {
  private readonly http = inject(HttpClient);

  summary(days = 7): Promise<MetricsSummary> {
    const params = new HttpParams().set('days', String(days));
    return firstValueFrom(
      this.http.get<MetricsSummary>(`${environment.apiBaseUrl}/metrics/summary`, {
        params,
      }),
    );
  }
}
