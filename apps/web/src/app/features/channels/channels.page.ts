import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DsActionBarComponent, DsButtonComponent, DsDisclosureComponent, DsEmptyStateComponent, DsFormSectionComponent, DsIconComponent, DsSelectComponent } from '@vendedoria/ui';
import { AuthorizedWhatsAppPhone, ChannelDto, ChannelDiagnostics, MessagingApiService, WhatsAppSignupConfiguration, WhatsAppSignupSession, WhatsAppManualWebhook } from '../../core/api/messaging-api.service';
import { MetaWhatsAppSignupService } from './meta-whatsapp-signup.service';

@Component({
  selector: 'app-channels-page', standalone: true,
  imports: [ReactiveFormsModule, DsActionBarComponent, DsSelectComponent, DsButtonComponent, DsEmptyStateComponent, DsIconComponent, DsDisclosureComponent, DsFormSectionComponent],
  templateUrl: './channels.page.html', changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelsPage implements OnDestroy {
  private readonly api = inject(MessagingApiService);
  private readonly meta = inject(MetaWhatsAppSignupService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute, { optional: true });
  private session: WhatsAppSignupSession | null = null;
  private destroyed = false;
  private attemptVersion = 0;
  readonly channels = signal<ChannelDto[]>([]);
  readonly configuration = signal<WhatsAppSignupConfiguration | null>(null);
  readonly mode = signal<'meta' | 'manual'>('meta');
  readonly manualWebhook = signal<WhatsAppManualWebhook | null>(null);
  readonly setupFailed = signal(false);
  readonly setupLoading = signal(false);
  readonly phones = signal<AuthorizedWhatsAppPhone[]>([]);
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly preparing = signal(false);
  readonly ready = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly diagnostics = signal<ChannelDiagnostics | null>(null);
  readonly diagnosticsLoading = signal(false);
  readonly diagnosticsFailed = signal(false);
  readonly operation = signal<'authorize' | 'activate' | 'disconnect' | null>(null);
  readonly activationForm = this.fb.nonNullable.group({ phoneNumberId: [''], pin: [''] });
  readonly manualForm = this.fb.nonNullable.group({
    appId: ['', [Validators.required, Validators.pattern(/^\d{5,30}$/)]],
    appSecret: ['', [Validators.required, Validators.pattern(/^[a-fA-F0-9]{32}$/)]],
    accessToken: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(4096)]],
    wabaId: ['', [Validators.required, Validators.pattern(/^\d{5,30}$/)]],
    phoneNumberId: ['', [Validators.required, Validators.pattern(/^\d{5,30}$/)]],
  });

  constructor() { void this.load(); }
  get whatsapp(): ChannelDto | undefined { return this.channels().find(channel => channel.type === 'WHATSAPP'); }
  get manualConnection(): boolean { return this.whatsapp?.metadata?.onboarding === 'MANUAL' && this.whatsapp.healthStatus !== 'DISCONNECTED'; }
  get hasConnection(): boolean { return !!this.whatsapp && this.whatsapp.healthStatus !== 'DISCONNECTED'; }
  get selectedPhone(): AuthorizedWhatsAppPhone | undefined { return this.phones().find(phone => phone.id === this.activationForm.controls.phoneNumberId.value); }
  get requiresPin(): boolean { return !!this.selectedPhone && !this.selectedPhone.registered && !this.selectedPhone.coexistence; }
  get pinInvalid(): boolean { return this.requiresPin && !/^\d{6}$/.test(this.activationForm.controls.pin.value); }

  async load(): Promise<void> {
    this.loading.set(true); this.loadFailed.set(false); this.errorMessage.set(null);
    try {
      const [channels, config] = await Promise.all([this.api.listChannels(), this.api.getWhatsAppSignupConfiguration()]);
      this.channels.set(channels); this.configuration.set(config);
      const requested = this.route?.snapshot.queryParamMap.get('connection');
      this.mode.set(requested === 'manual' || (!requested && (this.manualConnection || !config.available && config.manualAvailable)) ? 'manual' : 'meta');
      await Promise.all([this.loadDiagnostics(), this.manualConnection && config.canManage ? this.loadManualSetup() : Promise.resolve(), config.available && config.canManage && this.mode() === 'meta' && !this.manualConnection ? this.prepare() : Promise.resolve()]);
    } catch { this.loadFailed.set(true); }
    finally { this.loading.set(false); }
  }
  async prepare(): Promise<void> {
    if (this.preparing() || this.destroyed) return;
    const config = this.configuration();
    if (!config?.canManage || !config.available || !config.appId || this.mode() !== 'meta' || this.manualConnection) return;
    this.preparing.set(true); this.ready.set(false);
    try {
      if (this.session) await this.api.cancelWhatsAppSignup(this.session);
      this.session = null;
      const [session] = await Promise.all([this.api.startWhatsAppSignup(), this.meta.load(config.appId, config.graphVersion)]);
      this.session = session;
      if (this.destroyed) { await this.api.cancelWhatsAppSignup(session); return; }
      this.ready.set(this.mode() === 'meta');
    } catch (error) { this.errorMessage.set(this.message(error, 'No pudimos preparar la conexión. Inténtalo de nuevo.')); }
    finally { this.preparing.set(false); }
  }
  async connect(): Promise<void> {
    if (this.saving() || !this.ready() || !this.session || this.destroyed || this.mode() !== 'meta' || this.manualConnection) return;
    if (new Date(this.session.expiresAt).getTime() <= Date.now()) {
      await this.prepare();
      this.successMessage.set('La conexión está preparada. Pulsa «Conectar con Meta» para continuar.');
      return;
    }
    this.saving.set(true); this.operation.set('authorize'); this.errorMessage.set(null); this.successMessage.set(null);
    const session = this.session;
    const attempt = ++this.attemptVersion;
    try {
      const code = await this.meta.login(session);
      const result = await this.api.authorizeWhatsAppSignup(session, code);
      if (this.destroyed || attempt !== this.attemptVersion) { await this.api.cancelWhatsAppSignup(session); await this.prepare(); return; }
      this.phones.set(result.phones);
      this.activationForm.reset({ phoneNumberId: result.phones[0]?.id || '', pin: '' });
      this.successMessage.set('Cuenta autorizada. Confirma el número que quieres conectar.');
    } catch (error) {
      this.errorMessage.set(this.message(error, 'No pudimos autorizar WhatsApp. Vuelve a intentarlo.'));
      await this.prepare();
    } finally { this.saving.set(false); this.operation.set(null); }
  }
  async activate(): Promise<void> {
    if (this.saving() || !this.session || !this.selectedPhone) return;
    if (this.pinInvalid) { this.activationForm.controls.pin.markAsTouched(); return; }
    this.saving.set(true); this.operation.set('activate'); this.errorMessage.set(null); this.successMessage.set(null);
    try {
      const result = await this.api.completeWhatsAppSignup(this.session, this.selectedPhone, this.requiresPin ? this.activationForm.controls.pin.value : undefined);
      this.channels.update(channels => [result.channel, ...channels.filter(channel => channel.type !== 'WHATSAPP')]);
      this.activationForm.controls.pin.reset(''); this.phones.set([]); this.session = null; this.ready.set(false);
      this.successMessage.set('WhatsApp conectado. Envía un mensaje desde otro teléfono y comprueba su recepción en Mensajes.');
      await this.loadDiagnostics(); await this.prepare();
    } catch (error) {
      this.errorMessage.set(this.message(error, 'No pudimos activar WhatsApp. Vuelve a autorizar tu cuenta con Meta.'));
      this.activationForm.controls.pin.reset(''); this.phones.set([]);
      await this.loadDiagnostics(); await this.prepare();
    } finally { this.saving.set(false); this.operation.set(null); }
  }
  async cancel(): Promise<void> {
    if (this.operation() === 'activate' || this.operation() === 'disconnect') return;
    this.attemptVersion++;
    this.meta.cancel();
    this.phones.set([]); this.activationForm.reset();
    if (!this.saving()) await this.prepare();
  }
  async disconnect(): Promise<void> {
    if (this.saving() || !this.whatsapp || !this.configuration()?.canManage) return;
    this.saving.set(true); this.operation.set('disconnect'); this.errorMessage.set(null); this.successMessage.set(null);
    try {
      await this.api.disconnectWhatsApp(this.whatsapp.id);
      this.manualWebhook.set(null);
      this.channels.set(await this.api.listChannels());
      this.successMessage.set('WhatsApp desconectado de VendedorIA.');
      await this.loadDiagnostics(); await this.prepare();
    } catch (error) { this.errorMessage.set(this.message(error, 'No pudimos desconectar WhatsApp. Inténtalo de nuevo.')); }
    finally { this.saving.set(false); this.operation.set(null); }
  }
  async selectMode(value: 'meta' | 'manual'): Promise<void> {
    if (value !== 'meta' && value !== 'manual') return;
    if (this.saving() || this.preparing() || this.phones().length) return;
    this.mode.set(value); this.errorMessage.set(null); this.successMessage.set(null);
    if (value === 'manual') { this.ready.set(false); if (this.session) await this.api.cancelWhatsAppSignup(this.session).catch(() => undefined); this.session = null; }
    else { this.manualForm.reset(); this.manualWebhook.set(null); await this.prepare(); }
    if (value === 'manual' && this.manualConnection) await this.loadManualSetup();
  }
  changeMode(event: Event): void {
    if (event.target instanceof HTMLSelectElement && (event.target.value === 'meta' || event.target.value === 'manual')) void this.selectMode(event.target.value);
  }
  async connectManual(): Promise<void> {
    if (this.saving() || !this.configuration()?.canManage || !this.configuration()?.manualAvailable || this.hasConnection) return;
    if (this.manualForm.invalid) { this.manualForm.markAllAsTouched(); return; }
    this.saving.set(true); this.errorMessage.set(null); this.successMessage.set(null);
    try {
      const result = await this.api.connectWhatsAppManual(this.manualForm.getRawValue());
      this.channels.update(channels => [result.channel, ...channels.filter(channel => channel.type !== 'WHATSAPP')]);
      this.manualWebhook.set(result.webhook); this.manualForm.reset();
      this.successMessage.set('Credenciales verificadas. Configura el webhook en tu app de Meta para activar WhatsApp.');
      await this.loadDiagnostics();
    } catch (error) { this.errorMessage.set(this.message(error, 'No pudimos verificar las credenciales. Revisa los datos e inténtalo de nuevo.')); }
    finally { this.saving.set(false); }
  }
  async loadManualSetup(): Promise<void> {
    if (!this.manualConnection || !this.whatsapp || !this.configuration()?.canManage || this.setupLoading()) return;
    this.setupLoading.set(true); this.setupFailed.set(false);
    try { this.manualWebhook.set(await this.api.getWhatsAppManualSetup(this.whatsapp.id)); }
    catch { this.setupFailed.set(true); }
    finally { this.setupLoading.set(false); }
  }
  async activateManual(): Promise<void> {
    if (this.saving() || !this.manualConnection || !this.whatsapp || !this.configuration()?.canManage) return;
    this.saving.set(true); this.operation.set('activate'); this.errorMessage.set(null); this.successMessage.set(null);
    try {
      const result = await this.api.activateWhatsAppManual(this.whatsapp.id);
      this.channels.update(channels => [result.channel, ...channels.filter(channel => channel.type !== 'WHATSAPP')]);
      this.successMessage.set('WhatsApp conectado con tu app de Meta. Comprueba la recepción de un mensaje en Mensajes.');
      await this.loadDiagnostics(); await this.loadManualSetup();
    } catch (error) { this.errorMessage.set(this.message(error, 'No pudimos activar la conexión. Revisa el webhook en Meta e inténtalo de nuevo.')); }
    finally { this.saving.set(false); this.operation.set(null); }
  }
  async loadDiagnostics(): Promise<void> {
    if (this.diagnosticsLoading()) return;
    this.diagnosticsLoading.set(true); this.diagnosticsFailed.set(false);
    try {
      const result = await this.api.getWhatsAppDiagnostics(); this.diagnostics.set(result);
      if (result.channel) this.channels.update(channels => channels.map(channel => channel.id === result.channel!.id ? { ...channel, healthStatus: result.healthStatus } : channel));
    } catch { this.diagnosticsFailed.set(true); }
    finally { this.diagnosticsLoading.set(false); }
  }
  private message(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) return typeof error.error?.message === 'string' ? error.error.message : fallback;
    return error instanceof Error ? error.message : fallback;
  }
  checkStatusLabel(status: 'ok' | 'warn' | 'error'): string { return status === 'ok' ? 'Listo' : status === 'warn' ? 'Revisar' : 'Requiere atención'; }
  statusLabel(status: ChannelDto['healthStatus']): string { return ({ CONNECTED: 'Conectado', DEGRADED: 'Requiere atención', DISCONNECTED: 'Desconectado', PENDING: 'Pendiente' })[status]; }
  ngOnDestroy(): void {
    this.destroyed = true; this.attemptVersion++; this.meta.cancel();
    this.manualForm.reset(); this.manualWebhook.set(null);
    if (this.session) void this.api.cancelWhatsAppSignup(this.session).catch(() => undefined);
  }
}
