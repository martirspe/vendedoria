import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ConversionSettings = {
  recoveryEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  whatsappTemplate?: string | null;
  whatsappLanguage: string;
  delaysMinutes: number[];
};
export type ConversionSummary = {
  savedCarts: number;
  resumedCarts: number;
  deliveries: Record<string, number>;
};
@Injectable({ providedIn: 'root' })
export class ConversionApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/conversion`;
  get(): Promise<ConversionSettings> {
    return firstValueFrom(this.http.get<ConversionSettings>(`${this.base}/settings`));
  }
  summary(): Promise<ConversionSummary> {
    return firstValueFrom(this.http.get<ConversionSummary>(`${this.base}/summary`));
  }
  save(settings: ConversionSettings): Promise<ConversionSettings> {
    return firstValueFrom(this.http.put<ConversionSettings>(`${this.base}/settings`, settings));
  }
}
