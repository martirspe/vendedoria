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
const TURNSTILE_HEADER = 'X-Turnstile-Token';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  readonly isAuthenticated = signal(false);
  private refreshInFlight: Promise<AuthTokensResponse> | null = null;
  private turnstileConfig: Promise<string | null> | null = null;

  constructor() {
    this.syncFromStorage();
  }

  /** Re-read tokens from localStorage (needed after SSR / hard refresh). */
  syncFromStorage(): void {
    this.isAuthenticated.set(Boolean(this.getAccessToken()));
  }

  getAccessToken(): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    return localStorage.getItem(ACCESS_KEY);
  }

  getRefreshToken(): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    return localStorage.getItem(REFRESH_KEY);
  }

  /** Turnstile site key for login and sign-up; `null` when the API does not require a challenge. */
  turnstileSiteKey(): Promise<string | null> {
    this.turnstileConfig ??= firstValueFrom(
      this.http.get<{ siteKey: string | null }>(`${environment.apiBaseUrl}/turnstile/config`),
    )
      .then((config) => config.siteKey)
      .catch(() => {
        this.turnstileConfig = null;
        return null;
      });
    return this.turnstileConfig;
  }

  async register(
    payload: {
      email: string;
      password: string;
      fullName: string;
      businessName: string;
    },
    turnstileToken?: string,
  ): Promise<AuthTokensResponse> {
    const response = await firstValueFrom(
      this.http.post<AuthTokensResponse>(
        `${environment.apiBaseUrl}/auth/register`,
        payload,
        this.challenge(turnstileToken),
      ),
    );
    this.persist(response);
    return response;
  }

  async login(
    payload: {
      email: string;
      password: string;
    },
    turnstileToken?: string,
  ): Promise<AuthTokensResponse> {
    const response = await firstValueFrom(
      this.http.post<AuthTokensResponse>(
        `${environment.apiBaseUrl}/auth/login`,
        payload,
        this.challenge(turnstileToken),
      ),
    );
    this.persist(response);
    return response;
  }

  /**
   * Rotate access+refresh tokens. Single-flight so parallel 401s share one refresh
   * (API revokes the previous refresh token on each successful refresh).
   */
  async refreshSession(): Promise<AuthTokensResponse> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token');
    }

    this.refreshInFlight = firstValueFrom(
      this.http.post<AuthTokensResponse>(
        `${environment.apiBaseUrl}/auth/refresh`,
        { refreshToken },
      ),
    )
      .then((response) => {
        this.persist(response);
        return response;
      })
      .finally(() => {
        this.refreshInFlight = null;
      });

    return this.refreshInFlight;
  }

  logout(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
    }
    this.isAuthenticated.set(false);
  }

  private challenge(token?: string): { headers?: Record<string, string> } {
    return token ? { headers: { [TURNSTILE_HEADER]: token } } : {};
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
