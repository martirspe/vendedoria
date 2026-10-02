import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type TenantDto = {
  id: string;
  name: string;
  slug: string;
  country: string;
  currency: string;
  planTier: string;
  createdAt: string;
  updatedAt: string;
};

export type UpdateTenantPayload = Partial<{
  name: string;
  country: string;
  currency: string;
}>;

@Injectable({ providedIn: 'root' })
export class TenantsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/tenants/me`;

  getMe(): Promise<TenantDto> {
    return firstValueFrom(this.http.get<TenantDto>(this.base));
  }

  updateMe(payload: UpdateTenantPayload): Promise<TenantDto> {
    return firstValueFrom(this.http.patch<TenantDto>(this.base, payload));
  }
}
