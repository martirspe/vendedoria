import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DsButtonComponent, DsConfirmService, DsIconComponent } from '@vendedoria/ui';
import { AccountApiService } from '../../core/api/account-api.service';
import { messageFrom } from '../../core/api/api-error';
import { AuthApiService, type MembershipRole } from '../../core/auth/auth-api.service';
import { initialsOf, passwordStrength } from './profile-utils';

type Notice = { tone: 'success' | 'danger'; text: string };
type PasswordField = 'current' | 'next' | 'confirm';

const ROLES: Record<MembershipRole, { label: string; description: string }> = {
  OWNER: { label: 'Dueño', description: 'Creaste este negocio y tienes acceso a todo: plan, cobros, equipo y ajustes.' },
  ADMIN: { label: 'Administrador', description: 'Atiendes mensajes y pedidos, y además gestionas la cuenta del negocio.' },
  AGENT: { label: 'Asesor', description: 'Atiendes mensajes y pedidos de tus clientes.' },
};

const MONTH_YEAR = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' });

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, DsButtonComponent, DsIconComponent],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage {
  private readonly account = inject(AccountApiService);
  private readonly auth = inject(AuthApiService);
  private readonly fb = inject(FormBuilder);
  private readonly confirmDialog = inject(DsConfirmService);

  readonly profile = this.account.profile;
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly savingName = signal(false);
  readonly savingPassword = signal(false);
  readonly revoking = signal(false);
  readonly nameNotice = signal<Notice | null>(null);
  readonly passwordNotice = signal<Notice | null>(null);
  readonly sessionNotice = signal<Notice | null>(null);
  readonly visible = signal<Record<PasswordField, boolean>>({ current: false, next: false, confirm: false });
  readonly isManager = this.auth.isManager();

  readonly nameForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
  });

  readonly passwordForm = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required, Validators.maxLength(128)]],
    newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
    confirmPassword: ['', [Validators.required]],
  });

  private readonly passwords = toSignal(this.passwordForm.valueChanges, {
    initialValue: this.passwordForm.getRawValue(),
  });

  readonly strength = computed(() => passwordStrength(this.passwords().newPassword ?? ''));
  readonly mismatch = computed(() => {
    const { newPassword, confirmPassword } = this.passwords();
    return !!confirmPassword && confirmPassword !== newPassword;
  });
  readonly initials = computed(() => {
    const profile = this.profile();
    return profile ? initialsOf(profile.fullName, profile.email) : '';
  });
  readonly role = computed(() => {
    const profile = this.profile();
    return profile ? ROLES[profile.role] : null;
  });
  readonly memberSince = computed(() => {
    const profile = this.profile();
    return profile ? MONTH_YEAR.format(new Date(profile.memberSince)) : '';
  });
  readonly otherSessions = computed(() => Math.max((this.profile()?.activeSessions ?? 1) - 1, 0));

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const profile = await this.account.load();
      this.nameForm.reset({ fullName: profile.fullName ?? '' });
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  async saveName(): Promise<void> {
    if (this.nameForm.invalid) {
      this.nameForm.markAllAsTouched();
      return;
    }
    this.savingName.set(true);
    this.nameNotice.set(null);
    try {
      const profile = await this.account.update(this.nameForm.getRawValue().fullName.trim());
      this.nameForm.reset({ fullName: profile.fullName ?? '' });
      this.nameNotice.set({ tone: 'success', text: 'Tus datos se guardaron.' });
    } catch (error) {
      this.nameNotice.set({ tone: 'danger', text: messageFrom(error, 'No pudimos guardar tus datos. Inténtalo de nuevo.') });
    } finally {
      this.savingName.set(false);
    }
  }

  async changePassword(): Promise<void> {
    if (this.passwordForm.invalid || this.mismatch()) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    this.savingPassword.set(true);
    this.passwordNotice.set(null);
    try {
      const { revokedSessions } = await this.account.changePassword(currentPassword, newPassword);
      this.passwordForm.reset();
      this.visible.set({ current: false, next: false, confirm: false });
      this.passwordNotice.set({
        tone: 'success',
        text: revokedSessions
          ? `Contraseña actualizada. Cerramos tu sesión en ${this.devices(revokedSessions)}.`
          : 'Contraseña actualizada.',
      });
      await this.refreshSessions();
    } catch (error) {
      this.passwordNotice.set({ tone: 'danger', text: messageFrom(error, 'No pudimos cambiar tu contraseña. Inténtalo de nuevo.') });
    } finally {
      this.savingPassword.set(false);
    }
  }

  async revokeOtherSessions(): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: '¿Cerrar sesión en los demás dispositivos?',
      message: 'Tendrás que volver a iniciar sesión en cada uno. Este dispositivo sigue conectado.',
      confirmLabel: 'Cerrar las demás',
      cancelLabel: 'Cancelar',
      tone: 'danger',
    });
    if (!confirmed) return;
    this.revoking.set(true);
    this.sessionNotice.set(null);
    try {
      const { revokedSessions } = await this.account.revokeOtherSessions();
      this.sessionNotice.set({
        tone: 'success',
        text: revokedSessions ? `Cerramos tu sesión en ${this.devices(revokedSessions)}.` : 'No había otras sesiones abiertas.',
      });
      await this.refreshSessions();
    } catch (error) {
      this.sessionNotice.set({ tone: 'danger', text: messageFrom(error, 'No pudimos cerrar las demás sesiones.') });
    } finally {
      this.revoking.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    location.href = '/auth/login';
  }

  toggle(field: PasswordField): void {
    this.visible.update((state) => ({ ...state, [field]: !state[field] }));
  }

  invalid(control: 'fullName' | 'currentPassword' | 'newPassword' | 'confirmPassword'): boolean {
    const field = control === 'fullName' ? this.nameForm.controls.fullName : this.passwordForm.controls[control];
    return field.invalid && field.touched;
  }

  private async refreshSessions(): Promise<void> {
    await this.account.load().catch(() => undefined);
  }

  private devices(count: number): string {
    return count === 1 ? '1 dispositivo' : `${count} dispositivos`;
  }
}
