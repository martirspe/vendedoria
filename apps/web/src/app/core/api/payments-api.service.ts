import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PaymentAccountView = {
  provider: 'mercadopago';
  connected: boolean;
  publicKey: string | null;
  liveMode: boolean;
  externalUserId: string | null;
  verifiedAt: string | null;
  hasWebhookSecret: boolean;
  webhookUrl: string;
  simulatorAvailable: boolean;
  encryptionConfigured: boolean;
};

export type ConnectPaymentAccountPayload = {
  accessToken?: string;
  publicKey: string;
  webhookSecret?: string;
  liveMode: boolean;
};

@Injectable({ providedIn: 'root' })
export class PaymentsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/payments/account`;

  get(): Promise<PaymentAccountView> {
    return firstValueFrom(this.http.get<PaymentAccountView>(this.base));
  }

  connect(payload: ConnectPaymentAccountPayload): Promise<PaymentAccountView> {
    return firstValueFrom(this.http.put<PaymentAccountView>(this.base, payload));
  }

  disconnect(): Promise<PaymentAccountView> {
    return firstValueFrom(this.http.delete<PaymentAccountView>(this.base));
  }
}
