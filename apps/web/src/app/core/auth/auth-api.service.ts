import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type AuthTokensResponse = {
  accessToken: string;
  refreshToken: string;
  tenantId: string;
  user: { id: string; email: string; role: string };
};

const ACCESS_KEY = 'vendedoria.accessToken';
const REFRESH_KEY = 'vendedoria.refreshToken';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  readonly isAuthenticated = signal(!!this.getAccessToken());

  getAccessToken(): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    return localStorage.getItem(ACCESS_KEY);
  }

  async register(payload: {
    email: string;
    password: string;
    fullName: string;
    businessName: string;
  }): Promise<AuthTokensResponse> {
    const response = await firstValueFrom(
      this.http.post<AuthTokensResponse>(
        `${environment.apiBaseUrl}/auth/register`,
        payload,
      ),
    );
    this.persist(response);
    return response;
  }

  async login(payload: {
    email: string;
    password: string;
  }): Promise<AuthTokensResponse> {
    const response = await firstValueFrom(
      this.http.post<AuthTokensResponse>(
        `${environment.apiBaseUrl}/auth/login`,
        payload,
      ),
    );
    this.persist(response);
    return response;
  }

  logout(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
    }
    this.isAuthenticated.set(false);
  }

  private persist(response: AuthTokensResponse): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(ACCESS_KEY, response.accessToken);
    localStorage.setItem(REFRESH_KEY, response.refreshToken);
    this.isAuthenticated.set(true);
  }
}
