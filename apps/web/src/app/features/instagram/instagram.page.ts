import { DsEmptyStateComponent } from '@vendedoria/ui';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DsButtonComponent, DsConfirmService, DsIconComponent } from '@vendedoria/ui';
import { messageFrom } from '../../core/api/api-error';
import { InstagramStatus, IntegrationsApiService } from '../../core/api/integrations-api.service';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { IntegrationsStateService } from '../../core/integrations/integrations-state.service';
import { IntegrationGateComponent } from '../integrations/integration-gate.component';

@Component({
  selector: 'app-instagram-page',
  standalone: true,
  imports: [DsEmptyStateComponent, ReactiveFormsModule, DsButtonComponent, DsIconComponent, IntegrationGateComponent],
  templateUrl: './instagram.page.html',
  styleUrls: ['../store/store.page.scss', '../payments/payments.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstagramPage {
  private readonly api = inject(IntegrationsApiService);
  private readonly fb = inject(FormBuilder);
  private readonly integrations = inject(IntegrationsStateService);
  private readonly confirmDialog = inject(DsConfirmService);
  readonly canManage = inject(AuthApiService).isManager();

  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly status = signal<InstagramStatus | null>(null);
  readonly active = computed(() => this.integrations.isActive('instagram'));
  readonly connected = computed(() => this.status()?.channel?.healthStatus === 'CONNECTED');
  readonly receiving = computed(() => {
    const webhook = this.status()?.webhook;
    return !!webhook && webhook.verifyTokenConfigured && webhook.signatureConfigured;
  });

  readonly form = this.fb.nonNullable.group({
    accessToken: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(1000)]],
    accountId: ['', [Validators.pattern(/^\d{5,30}$/)]],
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.errorMessage.set(null);
    try {
      await this.integrations.refresh();
      if (this.active()) this.status.set(await this.api.getInstagram());
    } catch {
      this.loadFailed.set(true);
      this.errorMessage.set('No pudimos cargar tu conexión con Instagram. Inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  async connect(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Revisa los campos marcados.');
      return;
    }
    const { accessToken, accountId } = this.form.getRawValue();
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    try {
      this.status.set(
        await this.api.connectInstagram({
          accessToken: accessToken.trim(),
          ...(accountId.trim() ? { accountId: accountId.trim() } : {}),
        }),
      );
      this.form.reset({ accessToken: '', accountId: '' });
      this.successMessage.set('Instagram conectado. Tu vendedor ya responde los mensajes directos.');
    } catch (error) {
      this.errorMessage.set(messageFrom(error, 'No pudimos conectar tu cuenta de Instagram.'));
    } finally {
      this.saving.set(false);
    }
  }

  async disconnect(): Promise<void> {
    const channel = this.status()?.channel;
    if (!channel) return;
    const confirmed = await this.confirmDialog.confirm({
      title: '¿Desconectar Instagram?',
      message: 'Tu vendedor dejará de responder los mensajes directos.',
      confirmLabel: 'Desconectar',
      tone: 'danger',
    });
    if (!confirmed) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    try {
      await this.api.disconnectChannel(channel.id);
      this.status.set(await this.api.getInstagram());
      this.successMessage.set('Instagram desconectado.');
    } catch (error) {
      this.errorMessage.set(messageFrom(error, 'No pudimos desconectar Instagram.'));
    } finally {
      this.saving.set(false);
    }
  }
}
