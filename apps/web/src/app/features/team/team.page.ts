import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  DsButtonComponent,
  DsConfirmService,
  DsEmptyStateComponent,
  DsIconComponent,
} from '@vendedoria/ui';
import { messageFrom } from '../../core/api/api-error';
import {
  AssignableRole,
  TeamApiService,
  TeamInvite,
  TeamMember,
  TeamOverview,
} from '../../core/api/team-api.service';
import type { MembershipRole } from '../../core/auth/auth-api.service';
import { IntegrationsStateService } from '../../core/integrations/integrations-state.service';
import { IntegrationGateComponent } from '../integrations/integration-gate.component';

const ROLE_LABELS: Record<MembershipRole, string> = {
  OWNER: 'Dueño',
  ADMIN: 'Administrador',
  AGENT: 'Asesor',
};

@Component({
  selector: 'app-team-page',
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    DsButtonComponent,
    DsEmptyStateComponent,
    DsIconComponent,
    IntegrationGateComponent,
  ],
  templateUrl: './team.page.html',
  styleUrls: ['../store/store.page.scss', '../payments/payments.page.scss', './team.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamPage {
  private readonly api = inject(TeamApiService);
  private readonly fb = inject(FormBuilder);
  private readonly integrations = inject(IntegrationsStateService);
  private readonly confirmDialog = inject(DsConfirmService);

  readonly roleLabels = ROLE_LABELS;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly copied = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly overview = signal<TeamOverview | null>(null);
  /** Shown once right after creating an invite; the API never returns it again. */
  readonly inviteLink = signal<{ email: string; link: string } | null>(null);
  readonly active = computed(() => this.integrations.isActive('team'));
  readonly seatsFull = computed(() => {
    const overview = this.overview();
    return !!overview && overview.seatQuota !== null && overview.seatsUsed >= overview.seatQuota;
  });

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    role: ['AGENT' as AssignableRole, [Validators.required]],
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      await this.integrations.refresh();
      if (this.active()) this.overview.set(await this.api.overview());
    } catch {
      this.errorMessage.set('No pudimos cargar tu equipo. Inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  async invite(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Escribe un correo válido.');
      return;
    }
    const { email, role } = this.form.getRawValue();
    await this.run(async () => {
      const result = await this.api.invite(email.trim(), role);
      this.inviteLink.set({ email: result.invite.email, link: result.link });
      this.form.reset({ email: '', role: 'AGENT' });
    }, null, 'No pudimos crear la invitación.');
  }

  async copyLink(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.errorMessage.set('No se pudo copiar. Selecciona el enlace y cópialo manualmente.');
    }
  }

  async changeRole(member: TeamMember, event: Event): Promise<void> {
    const role = (event.target as HTMLSelectElement).value;
    if ((role !== 'ADMIN' && role !== 'AGENT') || role === member.role) return;
    await this.run(
      () => this.api.updateRole(member.id, role),
      `Ahora ${member.fullName ?? member.email} es ${ROLE_LABELS[role].toLowerCase()}.`,
      'No pudimos cambiar el rol.',
    );
  }

  async removeMember(member: TeamMember): Promise<void> {
    const name = member.fullName ?? member.email;
    const confirmed = await this.confirmDialog.confirm({
      title: `¿Quitar a ${name} del equipo?`,
      message: 'Perderá el acceso a tu consola de inmediato.',
      confirmLabel: 'Quitar del equipo',
      tone: 'danger',
    });
    if (!confirmed) return;
    await this.run(() => this.api.removeMember(member.id), `${name} ya no forma parte del equipo.`, 'No pudimos quitar a esa persona.');
  }

  async revokeInvite(invite: TeamInvite): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: '¿Cancelar la invitación?',
      message: `El enlace enviado a ${invite.email} dejará de funcionar.`,
      confirmLabel: 'Cancelar invitación',
      cancelLabel: 'Mantenerla',
      tone: 'danger',
    });
    if (!confirmed) return;
    await this.run(() => this.api.revokeInvite(invite.id), 'Invitación cancelada.', 'No pudimos cancelar la invitación.');
  }

  canEdit(member: TeamMember): boolean {
    return !!this.overview()?.canManage && member.role !== 'OWNER' && !member.isYou;
  }

  private async run(action: () => Promise<unknown>, success: string | null, fallback: string): Promise<void> {
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    try {
      await action();
      this.overview.set(await this.api.overview());
      if (success) this.successMessage.set(success);
    } catch (error) {
      this.errorMessage.set(messageFrom(error, fallback));
    } finally {
      this.saving.set(false);
    }
  }
}
