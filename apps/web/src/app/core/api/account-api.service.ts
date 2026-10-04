import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthApiService, type MembershipRole } from '../auth/auth-api.service';

export type AccountProfile = {
  id: string;
  email: string;
  fullName: string | null;
  role: MembershipRole;
  business: { name: string };
  memberSince: string;
  activeSessions: number;
};

@Injectable({ providedIn: 'root' })
export class AccountApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthApiService);
  private readonly base = `${environment.apiBaseUrl}/account`;

  /** Last profile read or saved; the console shell and the profile page share it. */
  readonly profile = signal<AccountProfile | null>(null);

  async load(): Promise<AccountProfile> {
    return this.remember(await firstValueFrom(this.http.get<AccountProfile>(`${this.base}/me`)));
  }

  async update(fullName: string): Promise<AccountProfile> {
    return this.remember(
      await firstValueFrom(this.http.patch<AccountProfile>(`${this.base}/me`, { fullName })),
    );
  }

  /** This device stays signed in; every other session is closed. */
  changePassword(currentPassword: string, newPassword: string): Promise<{ revokedSessions: number }> {
    return firstValueFrom(
      this.http.post<{ revokedSessions: number }>(`${this.base}/password`, {
        currentPassword,
        newPassword,
        refreshToken: this.auth.getRefreshToken() ?? undefined,
      }),
    );
  }

  revokeOtherSessions(): Promise<{ revokedSessions: number }> {
    return firstValueFrom(
      this.http.post<{ revokedSessions: number }>(`${this.base}/sessions/revoke-others`, {
        refreshToken: this.auth.getRefreshToken() ?? '',
      }),
    );
  }

  private remember(profile: AccountProfile): AccountProfile {
    this.profile.set(profile);
    return profile;
  }
}
