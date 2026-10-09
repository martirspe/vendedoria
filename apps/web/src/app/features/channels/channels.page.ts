import { DsActionBarComponent } from '@vendedoria/ui';
import { DsSelectComponent } from '@vendedoria/ui';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DsButtonComponent, DsDisclosureComponent, DsFormSectionComponent } from '@vendedoria/ui';
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
  imports: [DsActionBarComponent, DsSelectComponent,
    ReactiveFormsModule,
    DsButtonComponent,
    DsEmptyStateComponent,
    DsIconComponent,
    DsDisclosureComponent, DsFormSectionComponent,
  ],
  templateUrl: './channels.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelsPage {
  private readonly api = inject(MessagingApiService);
  private readonly fb = inject(FormBuilder);

  readonly channels = signal<ChannelDto[]>([]);
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly webhookInfo = signal<{
    callbackUrl: string;
    verifyTokenHint: string;
  } | null>(null);
  readonly diagnostics = signal<ChannelDiagnostics | null>(null);
  readonly diagnosticsLoading = signal(false);
  readonly diagnosticsFailed = signal(false);
  readonly operation = signal<'connect' | 'simulate' | null>(null);

  fieldError(field: keyof ChannelsPage['connectForm']['controls']): string | null {
    const control = this.connectForm.controls[field];
    if (!control.touched) return null;
    if (field === 'accessToken' && control.value.trim().length < 10) return 'Ingresa un token de acceso válido.';
    if (field === 'phoneNumberId' && control.value.trim().length < 3) return 'Ingresa el identificador del número de Meta.';
    return control.invalid ? 'Revisa este campo.' : null;
  }

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
    this.loadFailed.set(false);
    this.errorMessage.set(null);
    try {
      this.channels.set(await this.api.listChannels());
      await this.loadDiagnostics();
    } catch {
      this.loadFailed.set(true);
      this.errorMessage.set('No pudimos cargar los canales.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadDiagnostics(): Promise<void> {
    if (this.diagnosticsLoading()) return;
    this.diagnosticsLoading.set(true);
    this.diagnosticsFailed.set(false);
    try {
      this.diagnostics.set(await this.api.getWhatsAppDiagnostics());
    } catch {
      this.diagnosticsFailed.set(true);
    } finally {
      this.diagnosticsLoading.set(false);
    }
  }

  checkStatusLabel(status: 'ok' | 'warn' | 'error'): string {
    switch (status) {
      case 'ok':
        return 'Correcto';
      case 'warn':
        return 'Revisar';
      case 'error':
        return 'Error';
    }
  }

  async connect(): Promise<void> {
    if (this.saving()) return;
    if (this.connectForm.invalid || this.connectForm.controls.accessToken.value.trim().length < 10 || this.connectForm.controls.phoneNumberId.value.trim().length < 3) {
      this.connectForm.markAllAsTouched();
      this.errorMessage.set('Revisa los datos de conexión antes de continuar.');
      return;
    }
    this.saving.set(true);
    this.operation.set('connect');
    this.errorMessage.set(null);
    this.successMessage.set(null);
    try {
      const result = await this.api.connectWhatsApp(this.connectForm.getRawValue());
      this.channels.update(channels => [result.channel, ...channels.filter(channel => channel.id !== result.channel.id && channel.type !== 'WHATSAPP')]);
      this.connectForm.controls.accessToken.reset('');
      this.webhookInfo.set({
        callbackUrl: result.webhook.callbackUrl,
        verifyTokenHint: result.webhook.verifyTokenHint,
      });
      this.successMessage.set('Conexión guardada. Revisa el diagnóstico para completar la recepción de mensajes.');
      await this.loadDiagnostics();
    } catch {
      this.errorMessage.set(
        'No se pudo conectar WhatsApp. Revisa el identificador del número y el token de acceso.',
      );
    } finally {
      this.saving.set(false);
      this.operation.set(null);
    }
  }

  async simulate(): Promise<void> {
    if (this.saving() || !this.whatsapp) return;
    if (this.simulateForm.invalid) {
      this.simulateForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.operation.set('simulate');
    this.errorMessage.set(null);
    this.successMessage.set(null);
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
      this.operation.set(null);
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
