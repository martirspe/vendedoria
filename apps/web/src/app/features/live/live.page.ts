import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe, PercentPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { DsButtonComponent, DsConfirmService, DsEmptyStateComponent } from '@vendedoria/ui';
import {
  LiveApiService,
  LiveCampaign,
  LiveOffer,
  LivePanel,
  TikTokStatus,
} from '../../core/api/live-api.service';
import { CatalogApiService, ProductDto } from '../../core/api/catalog-api.service';
import { AgentsApiService, SalesAgentSummaryDto } from '../../core/api/agents-api.service';
import { InboxStreamEvent, InboxStreamService } from '../../core/api/inbox-stream.service';
import { messageFrom } from '../../core/api/api-error';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { IntegrationsStateService } from '../../core/integrations/integrations-state.service';
import { IntegrationGateComponent } from '../integrations/integration-gate.component';

const CAPABILITY_LABELS: Record<string, string> = {
  identity: 'Cuenta TikTok',
  liveSessions: 'Sesiones desde TikTok',
  liveProducts: 'Productos en TikTok LIVE',
  inboundComments: 'Lectura automática de comentarios',
  outboundReplies: 'Respuestas automáticas en TikTok',
  shopOrders: 'Pedidos de TikTok Shop',
  productSync: 'Sincronización con TikTok Shop',
  webhooks: 'Aviso de desconexión de cuenta',
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Por iniciar',
  ACTIVE: 'Activa',
  ENDED: 'Terminada',
  PENDING: 'Reservada',
  CHECKED_OUT: 'En checkout',
  CONVERTED: 'Pagada',
  EXPIRED: 'Vencida',
  CANCELLED: 'Cancelada',
};
const INTENT_LABELS: Record<string, string> = {
  BUY: 'Compra',
  BUY_QUANTITY: 'Compra con cantidad',
  PRICE: 'Precio',
  STOCK: 'Disponibilidad',
  SHIPPING: 'Envío',
  PAYMENT: 'Pago',
  PRODUCT_INFO: 'Información del producto',
  CANCEL: 'Cancelación',
  UNKNOWN: 'Por aclarar',
};

/** A LIVE stream notification invalidates the panel, using the inbox's authenticated SSE client. */
export function parseLiveUpdate(block: string): InboxStreamEvent | null {
  return /^event:\s*live\s*$/m.test(block) && /^data:/m.test(block)
    ? { kind: 'reconnected' }
    : null;
}

@Component({
  selector: 'app-live-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    PercentPipe,
    RouterLink,
    DsButtonComponent,
    DsEmptyStateComponent,
    IntegrationGateComponent,
  ],
  templateUrl: './live.page.html',
  styleUrl: './live.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LivePage {
  private readonly api = inject(LiveApiService);
  private readonly catalog = inject(CatalogApiService);
  private readonly agentsApi = inject(AgentsApiService);
  private readonly fb = inject(FormBuilder);
  private readonly stream = inject(InboxStreamService);
  private readonly confirm = inject(DsConfirmService);
  readonly integrations = inject(IntegrationsStateService);
  readonly canManage = inject(AuthApiService).isManager();
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly status = signal<TikTokStatus | null>(null);
  readonly campaigns = signal<LiveCampaign[]>([]);
  readonly products = signal<ProductDto[]>([]);
  readonly agents = signal<SalesAgentSummaryDto[]>([]);
  readonly panel = signal<LivePanel | null>(null);
  readonly checkoutUrl = signal<string | null>(null);
  readonly editingId = signal<string | null>(null);
  readonly showCampaign = signal(false);
  readonly active = computed(() => this.integrations.isActive('tiktok_live'));
  readonly current = computed(
    () => this.panel()?.products.find((p) => p.id === this.panel()?.currentOfferId) ?? null,
  );
  readonly capabilities = computed(() =>
    Object.entries(this.status()?.capabilities ?? {}).map(([key, status]) => ({
      key,
      label: CAPABILITY_LABELS[key] ?? key,
      status:
        status === 'supported'
          ? 'Disponible'
          : status === 'pending_approval'
            ? 'Requiere aprobación'
            : 'No disponible',
    })),
  );
  private subscription?: Subscription;
  private refreshing = false;
  private pendingRefresh = false;
  private messageRequestId?: string;
  private messageFingerprint = '';
  private reservationRequestId?: string;
  private reservationFingerprint = '';
  readonly settingsForm = this.fb.nonNullable.group({
    responseMode: ['HUMAN_APPROVAL' as 'AUTO' | 'HUMAN_APPROVAL' | 'HUMAN_ONLY'],
    reservationSeconds: [300, [Validators.required, Validators.min(60), Validators.max(900)]],
    maxReservationsPerSession: [
      500,
      [Validators.required, Validators.min(1), Validators.max(5000)],
    ],
  });
  readonly campaignForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    mode: ['LIVE_LIQUIDATION'],
    salesAgentId: [''],
    reservationSeconds: [300, [Validators.required, Validators.min(60), Validators.max(900)]],
    startsAt: [''],
    endsAt: [''],
    products: this.fb.array([this.offerForm()]),
  });
  readonly messageForm = this.fb.nonNullable.group({
    customerAlias: ['', [Validators.required, Validators.maxLength(100)]],
    text: ['', [Validators.required, Validators.maxLength(1000)]],
  });
  readonly reserveForm = this.fb.nonNullable.group({
    customerAlias: ['', [Validators.required, Validators.maxLength(100)]],
    quantity: [1, [Validators.required, Validators.min(1), Validators.max(20)]],
  });
  constructor() {
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
    void this.load();
  }
  private offerForm() {
    return this.fb.nonNullable.group({
      productId: ['', Validators.required],
      variantId: [''],
      priceSoles: [0, [Validators.required, Validators.min(1)]],
      allocatedStock: [1, [Validators.required, Validators.min(1)]],
      maxPerCustomer: [2, [Validators.required, Validators.min(1), Validators.max(20)]],
      enabled: [true],
      durationMinutes: [60, [Validators.required, Validators.min(1), Validators.max(1440)]],
    });
  }
  get offers() {
    return this.campaignForm.controls.products;
  }
  addOffer(): void {
    if (this.offers.length < 50) this.offers.push(this.offerForm());
  }
  removeOffer(index: number): void {
    if (this.offers.length > 1) this.offers.removeAt(index);
  }
  product(id: string): ProductDto | undefined {
    return this.products().find((p) => p.id === id);
  }
  selectProduct(index: number): void {
    const form = this.offers.at(index);
    const p = this.product(form.controls.productId.value);
    form.patchValue({ variantId: '', priceSoles: p ? p.basePriceCents / 100 : 0 });
  }
  newCampaign(): void {
    this.editingId.set(null);
    this.campaignForm.reset({
      name: '',
      mode: 'LIVE_LIQUIDATION',
      reservationSeconds: this.status()?.reservationSeconds ?? 300,
    });
    this.offers.clear();
    this.addOffer();
    this.showCampaign.set(true);
  }
  edit(campaign: LiveCampaign): void {
    this.editingId.set(campaign.id);
    this.campaignForm.patchValue({
      name: campaign.name,
      mode: campaign.mode,
      reservationSeconds: campaign.reservationSeconds,
      salesAgentId: campaign.salesAgentId ?? '',
      startsAt: campaign.startsAt ? this.localDate(campaign.startsAt) : '',
      endsAt: campaign.endsAt ? this.localDate(campaign.endsAt) : '',
    });
    this.offers.clear();
    for (const offer of campaign.products) {
      const form = this.offerForm();
      form.patchValue({
        productId: offer.productId,
        variantId: offer.variantId ?? '',
        priceSoles: offer.livePriceCents / 100,
        allocatedStock: offer.allocatedStock,
        maxPerCustomer: offer.maxPerCustomer,
        enabled: offer.enabled,
        durationMinutes: offer.durationSeconds / 60,
      });
      this.offers.push(form);
    }
    this.showCampaign.set(true);
  }
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.integrations.refresh();
      if (!this.active()) {
        this.subscription?.unsubscribe();
        this.panel.set(null);
        return;
      }
      const [status, campaigns, products, agents] = await Promise.all([
        this.api.status(),
        this.api.campaigns(),
        this.catalog.list(),
        this.agentsApi.list(),
      ]);
      this.status.set(status);
      this.settingsForm.setValue({
        responseMode: status.responseMode,
        reservationSeconds: status.reservationSeconds,
        maxReservationsPerSession: status.maxReservationsPerSession,
      });
      this.campaigns.set(campaigns);
      this.products.set(
        products.filter(
          (p) =>
            p.kind === 'PRODUCT' && p.isAvailable && p.isPublishedOnStore && p.currency === 'PEN',
        ),
      );
      this.agents.set(agents.filter((a) => a.isActive));
    } catch (error) {
      this.error.set(messageFrom(error, 'No pudimos cargar TikTok LIVE. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }
  async run(action: () => Promise<void>, success?: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.success.set(null);
    try {
      await action();
      if (success) this.success.set(success);
    } catch (error) {
      this.error.set(messageFrom(error, 'No pudimos completar la acción. Inténtalo de nuevo.'));
    } finally {
      this.busy.set(false);
    }
  }
  saveSettings(): void {
    if (this.settingsForm.invalid) {
      this.settingsForm.markAllAsTouched();
      return;
    }
    void this.run(async () => {
      this.status.set(await this.api.settings(this.settingsForm.getRawValue()));
    }, 'Configuración guardada.');
  }
  connect(): void {
    void this.run(async () => {
      const result = await this.api.connect();
      window.location.assign(result.url);
    });
  }
  verify(): void {
    void this.run(async () => {
      this.status.set(await this.api.verify());
    }, 'Cuenta TikTok validada. Los permisos LIVE se muestran por separado.');
  }
  async disconnect(): Promise<void> {
    if (
      !(await this.confirm.confirm({
        title: '¿Desconectar TikTok?',
        message: 'Se revocará la autorización de tu cuenta. Tus campañas y pedidos se conservan.',
        confirmLabel: 'Desconectar',
        tone: 'danger',
      }))
    )
      return;
    await this.run(async () => {
      this.status.set(await this.api.disconnect());
    }, 'Cuenta desconectada.');
  }
  saveCampaign(): void {
    if (this.campaignForm.invalid) {
      this.campaignForm.markAllAsTouched();
      this.error.set('Revisa los datos de la campaña y sus productos.');
      return;
    }
    void this.run(async () => {
      const v = this.campaignForm.getRawValue();
      await this.api.save(
        {
          name: v.name,
          mode: v.mode,
          reservationSeconds: v.reservationSeconds,
          ...(v.salesAgentId ? { salesAgentId: v.salesAgentId } : {}),
          ...(v.startsAt ? { startsAt: new Date(v.startsAt).toISOString() } : {}),
          ...(v.endsAt ? { endsAt: new Date(v.endsAt).toISOString() } : {}),
          products: v.products.map((p) => ({
            productId: p.productId,
            ...(p.variantId ? { variantId: p.variantId } : {}),
            livePriceCents: Math.round(p.priceSoles * 100),
            allocatedStock: p.allocatedStock,
            maxPerCustomer: p.maxPerCustomer,
            enabled: p.enabled,
            durationSeconds: p.durationMinutes * 60,
          })),
        },
        this.editingId() ?? undefined,
      );
      this.showCampaign.set(false);
      this.campaigns.set(await this.api.campaigns());
    }, 'Campaña guardada.');
  }
  start(id: string): void {
    void this.run(async () => {
      const session = await this.api.start(id);
      await this.openPanel(session.id);
      this.campaigns.set(await this.api.campaigns());
    }, 'Sesión operativa iniciada. La transmisión se controla desde TikTok.');
  }
  async openPanel(id: string): Promise<void> {
    this.subscription?.unsubscribe();
    this.checkoutUrl.set(null);
    this.panel.set(await this.api.panel(id));
    this.subscription = this.stream
      .events(`live/sessions/${id}/stream`, parseLiveUpdate)
      .subscribe(() => void this.refreshPanel());
  }
  open(id: string): void {
    void this.run(() => this.openPanel(id));
  }
  async refreshPanel(): Promise<void> {
    const id = this.panel()?.id;
    if (!id) return;
    if (this.refreshing) {
      this.pendingRefresh = true;
      return;
    }
    this.refreshing = true;
    try {
      const panel = await this.api.panel(id);
      if (this.panel()?.id === id) this.panel.set(panel);
    } catch (error) {
      this.error.set(
        messageFrom(
          error,
          'La actualización del panel se interrumpió. Reintenta para ver los datos actuales.',
        ),
      );
    } finally {
      this.refreshing = false;
      if (this.pendingRefresh) {
        this.pendingRefresh = false;
        void this.refreshPanel();
      }
    }
  }
  change(offer: LiveOffer): void {
    const p = this.panel();
    if (p)
      void this.run(async () => {
        this.panel.set(await this.api.current(p.id, offer.id));
      });
  }
  async end(): Promise<void> {
    const p = this.panel();
    if (
      !p ||
      !(await this.confirm.confirm({
        title: '¿Terminar la sesión?',
        message: 'No se crearán nuevas reservas. Los enlaces ya emitidos conservan su vencimiento.',
        confirmLabel: 'Terminar',
      }))
    )
      return;
    await this.run(async () => {
      this.panel.set(await this.api.end(p.id));
      this.campaigns.set(await this.api.campaigns());
    }, 'Sesión terminada.');
  }
  message(): void {
    if (this.messageForm.invalid) {
      this.messageForm.markAllAsTouched();
      return;
    }
    const panel = this.panel();
    if (!panel) return;
    const v = this.messageForm.getRawValue();
    const fingerprint = JSON.stringify([panel.id, v]);
    if (fingerprint !== this.messageFingerprint) {
      this.messageRequestId = crypto.randomUUID();
      this.messageFingerprint = fingerprint;
    }
    void this.run(async () => {
      await this.api.message(panel.id, { ...v, eventId: this.messageRequestId! });
      this.reserveForm.controls.customerAlias.setValue(v.customerAlias);
      this.messageRequestId = undefined;
      this.messageFingerprint = '';
      this.messageForm.controls.text.setValue('');
      await this.refreshPanel();
    }, 'Mensaje registrado manualmente.');
  }
  reserve(): void {
    if (this.reserveForm.invalid) {
      this.reserveForm.markAllAsTouched();
      return;
    }
    const panel = this.panel();
    const offer = this.current();
    if (!panel || !offer) return;
    const v = this.reserveForm.getRawValue();
    const fingerprint = JSON.stringify([panel.id, offer.id, v]);
    if (fingerprint !== this.reservationFingerprint) {
      this.reservationRequestId = crypto.randomUUID();
      this.reservationFingerprint = fingerprint;
    }
    void this.run(async () => {
      const result = await this.api.reserve(panel.id, {
        ...v,
        offerId: offer.id,
        idempotencyKey: this.reservationRequestId!,
      });
      this.checkoutUrl.set(result.checkoutUrl);
      this.reservationRequestId = undefined;
      this.reservationFingerprint = '';
      await this.refreshPanel();
    }, 'Reserva confirmada. Comparte el enlace de checkout con el comprador.');
  }
  approve(id: string): void {
    void this.run(async () => {
      await this.api.approve(id);
      await this.refreshPanel();
    }, 'Sugerencia revisada. Puedes copiarla y responder manualmente en TikTok.');
  }
  cancel(id: string): void {
    void this.run(async () => {
      await this.api.cancel(id);
      await this.refreshPanel();
    }, 'Reserva cancelada y unidades liberadas.');
  }
  async copy(text: string): Promise<void> {
    await this.run(async () => {
      await navigator.clipboard.writeText(text);
    }, 'Copiado al portapapeles.');
  }
  label(value: string): string {
    return STATUS_LABELS[value] ?? value;
  }
  intentLabel(value: string): string {
    return INTENT_LABELS[value] ?? 'Por aclarar';
  }
  private localDate(value: string): string {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
}
