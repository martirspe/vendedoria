import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

export type AuthTokensResponse = {
  accessToken: string;
  refreshToken: string;
  tenantId: string;
  user: { id: string; email: string; role: string };
};

export type MembershipRole = 'OWNER' | 'ADMIN' | 'AGENT';

export type InvitePreview = {
  businessName: string;
  email: string;
  role: MembershipRole;
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

  /** Business and email behind an invitation link, before creating the account. */
  previewInvite(token: string): Promise<InvitePreview> {
    return firstValueFrom(
      this.http.get<InvitePreview>(
        `${environment.apiBaseUrl}/team/invites/accept/${encodeURIComponent(token)}`,
      ),
    );
  }

  async acceptInvite(
    token: string,
    payload: { fullName: string; password: string },
    turnstileToken?: string,
  ): Promise<AuthTokensResponse> {
    const response = await firstValueFrom(
      this.http.post<AuthTokensResponse>(
        `${environment.apiBaseUrl}/team/invites/accept/${encodeURIComponent(token)}`,
        payload,
        this.challenge(turnstileToken),
      ),
    );
    this.persist(response);
    return response;
  }

  /** Role in the current business, read from the access token (the API enforces it anyway). */
  role(): MembershipRole | null {
    const token = this.getAccessToken();
    const payload = token?.split('.')[1];
    if (!payload) return null;
    try {
      const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { membershipRole?: string };
      return json.membershipRole === 'OWNER' || json.membershipRole === 'ADMIN' || json.membershipRole === 'AGENT'
        ? json.membershipRole
        : null;
    } catch {
      return null;
    }
  }

  isManager(): boolean {
    const role = this.role();
    return role === 'OWNER' || role === 'ADMIN';
  }

  /**
   * Clears this device at once; the returned promise settles when the API has revoked the
   * refresh token (or after a short timeout), so callers can await it before a hard navigation.
   */
  logout(): Promise<void> {
    const refreshToken = this.getRefreshToken();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
    }
    this.isAuthenticated.set(false);
    if (!refreshToken) return Promise.resolve();
    return firstValueFrom(
      this.http
        .post<void>(`${environment.apiBaseUrl}/auth/logout`, { refreshToken })
        .pipe(timeout(3000)),
    ).catch(() => undefined);
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
