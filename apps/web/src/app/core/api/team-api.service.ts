import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { MembershipRole } from '../auth/auth-api.service';

export type AssignableRole = Exclude<MembershipRole, 'OWNER'>;

export type TeamMember = {
  id: string;
  userId: string;
  fullName: string | null;
  email: string;
  role: MembershipRole;
  isYou: boolean;
  joinedAt: string;
};

export type TeamInvite = {
  id: string;
  email: string;
  role: MembershipRole;
  expiresAt: string;
  createdAt: string;
};

export type TeamOverview = {
  members: TeamMember[];
  invites: TeamInvite[];
  seatsUsed: number;
  seatQuota: number | null;
  canManage: boolean;
};

@Injectable({ providedIn: 'root' })
export class TeamApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/team`;

  overview(): Promise<TeamOverview> {
    return firstValueFrom(this.http.get<TeamOverview>(this.base));
  }

  /** The link is returned only once; share it with the invited person. */
  invite(email: string, role: AssignableRole): Promise<{ invite: TeamInvite; link: string }> {
    return firstValueFrom(
      this.http.post<{ invite: TeamInvite; link: string }>(`${this.base}/invites`, { email, role }),
    );
  }

  revokeInvite(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/invites/${encodeURIComponent(id)}`));
  }

  updateRole(memberId: string, role: AssignableRole): Promise<void> {
    return firstValueFrom(
      this.http.patch<void>(`${this.base}/members/${encodeURIComponent(memberId)}`, { role }),
    );
  }

  removeMember(memberId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/members/${encodeURIComponent(memberId)}`));
  }
}
