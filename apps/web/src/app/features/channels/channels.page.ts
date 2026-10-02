import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DsButtonComponent } from '@vendedoria/ui';
import { DsEmptyStateComponent } from '@vendedoria/ui';
import { DsIconComponent } from '@vendedoria/ui';
import {
  ChannelDto,
  ChannelDiagnostics,
  MessagingApiService,
} from '../../core/api/messaging-api.service';

@Component({
  selector: 'app-channels-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DsButtonComponent,
    DsEmptyStateComponent,
    DsIconComponent,
  ],
  templateUrl: './channels.page.html',
  styleUrl: './channels.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelsPage {
  private readonly api = inject(MessagingApiService);
  private readonly fb = inject(FormBuilder);

  readonly channels = signal<ChannelDto[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly webhookInfo = signal<{
    callbackUrl: string;
    verifyTokenHint: string;
  } | null>(null);
  readonly diagnostics = signal<ChannelDiagnostics | null>(null);
  readonly diagnosticsLoading = signal(false);

  readonly connectForm = this.fb.nonNullable.group({
    phoneNumberId: ['', [Validators.required, Validators.minLength(3)]],
    accessToken: ['', [Validators.required, Validators.minLength(10)]],
    displayName: ['WhatsApp Business'],
    connectionMode: ['NEW_WABA_NUMBER'],
  });

  readonly simulateForm = this.fb.nonNullable.group({
    fromPhone: ['51999999999', [Validators.required]],
    contactName: ['Cliente demo'],
    text: ['Hola, ¿tienen polos?', [Validators.required]],
  });

  constructor() {
    void this.load();
  }

  get whatsapp(): ChannelDto | undefined {
    return this.channels().find((channel) => channel.type === 'WHATSAPP');
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.channels.set(await this.api.listChannels());
      await this.loadDiagnostics();
    } catch {
      this.errorMessage.set('No pudimos cargar los canales.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadDiagnostics(): Promise<void> {
    this.diagnosticsLoading.set(true);
    try {
      this.diagnostics.set(await this.api.getWhatsAppDiagnostics());
    } catch {
      this.diagnostics.set(null);
    } finally {
      this.diagnosticsLoading.set(false);
    }
  }

  checkStatusLabel(status: 'ok' | 'warn' | 'error'): string {
    switch (status) {
      case 'ok':
        return 'OK';
      case 'warn':
        return 'Revisar';
      case 'error':
        return 'Error';
    }
  }

  async connect(): Promise<void> {
    if (this.connectForm.invalid) {
      this.connectForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    try {
      const result = await this.api.connectWhatsApp(this.connectForm.getRawValue());
      this.webhookInfo.set({
        callbackUrl: result.webhook.callbackUrl,
        verifyTokenHint: result.webhook.verifyTokenHint,
      });
      this.successMessage.set('WhatsApp conectado. Configura el webhook en Meta.');
      await this.load();
      await this.loadDiagnostics();
    } catch {
      this.errorMessage.set(
        'No se pudo conectar WhatsApp. Revisa Phone Number ID y access token.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  async simulate(): Promise<void> {
    if (this.simulateForm.invalid) {
      this.simulateForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      await this.api.simulateInbound(this.simulateForm.getRawValue());
      this.successMessage.set(
        'Mensaje simulado. Revisa Mensajes para ver la respuesta del agente.',
      );
    } catch {
      this.errorMessage.set(
        'No se pudo simular. Conecta WhatsApp primero e inténtalo de nuevo.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  statusLabel(status: ChannelDto['healthStatus']): string {
    switch (status) {
      case 'CONNECTED':
        return 'Conectado';
      case 'DEGRADED':
        return 'Degradado';
      case 'DISCONNECTED':
        return 'Desconectado';
      default:
        return 'Pendiente';
    }
  }
}
