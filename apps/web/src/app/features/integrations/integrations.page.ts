import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { LiveApiService, TikTokStatus } from '../../core/api/live-api.service';
import { DsButtonComponent, DsConfirmService, DsActionBarComponent, DsFormSectionComponent, DsSelectComponent, DsDisclosureComponent, DsEmptyStateComponent } from '@vendedoria/ui';
import { DsIconComponent } from '@vendedoria/ui';
import type { IntegrationKey } from '../../core/api/billing-api.service';
import { IntegrationState, IntegrationsApiService } from '../../core/api/integrations-api.service';
import { MessagingApiService } from '../../core/api/messaging-api.service';
import { OrdersApiService } from '../../core/api/orders-api.service';
import { AuthApiService } from '../../core/auth/auth-api.service';
import {
  INTEGRATIONS,
  IntegrationInfo,
  IntegrationsStateService,
  integrationInfo,
} from '../../core/integrations/integrations-state.service';
import { messageFrom } from '../../core/api/api-error';

type IntegrationCategory =
  | 'ALL'
  | 'Channel'
  | 'Payments'
  | 'E-commerce'
  | 'Shipping'
  | 'ERP';

const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  ALL: 'Todas',
  Channel: 'Canales',
  Payments: 'Cobros',
  'E-commerce': 'E-commerce',
  Shipping: 'Envíos',
  ERP: 'ERP',
};

type FeatureCard = IntegrationInfo & {
  state: IntegrationState | null;
  status: 'active' | 'paused' | 'available' | 'needs' | 'locked' | 'unavailable';
  /** Required integration that is off right now. */
  needs: IntegrationInfo | null;
};

type IntegrationCard = {
  id: string;
  name: string;
  category: Exclude<IntegrationCategory, 'ALL'>;
  status: 'connected' | 'ready' | 'waitlist';
  summary: string;
  nextStep: string;
  link?: string;
};

@Component({
  selector: 'app-integrations-page',
  standalone: true,
  imports: [DatePipe, DsButtonComponent, DsIconComponent, DsActionBarComponent, DsFormSectionComponent, DsSelectComponent, DsDisclosureComponent, DsEmptyStateComponent],
  templateUrl: './integrations.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IntegrationsPage {
  private readonly messaging = inject(MessagingApiService);
  private readonly orders = inject(OrdersApiService);
  private readonly liveApi = inject(LiveApiService);
  readonly tiktok = signal<TikTokStatus | null>(null);
  private readonly api = inject(IntegrationsApiService);
  private readonly confirmDialog = inject(DsConfirmService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  readonly integrations = inject(IntegrationsStateService);
  readonly canManage = inject(AuthApiService).isManager();

  readonly busyKey = signal<IntegrationKey | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly actionSuccess = signal<string | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly filter = computed<IntegrationCategory>(() => {
    const value = this.queryParams().get('category');
    return this.categories.find(category => category === value) ?? 'ALL';
  });
  readonly connectionError = signal<string | null>(null);
  readonly whatsappConnected = signal(false);
  readonly paymentsMock = signal(true);
  readonly paymentsProvider = signal('mock');
  readonly paymentsConfigured = signal(false);
  private loadInFlight = false;

  readonly categories: IntegrationCategory[] = [
    'ALL',
    'Channel',
    'Payments',
    'E-commerce',
    'Shipping',
    'ERP',
  ];

  readonly features = computed<FeatureCard[]>(() =>
    INTEGRATIONS.map((info) => {
      const state = this.integrations.states().find((item) => item.key === info.key) ?? null;
      const needs =
        state?.requires && !this.integrations.isActive(state.requires) ? integrationInfo(state.requires) : null;
      const status: FeatureCard['status'] = !state
        ? 'unavailable'
        : state.active
          ? 'active'
          : !state.included
            ? 'locked'
            : state.enabled && needs
              ? 'paused'
              : !state.available
                ? 'unavailable'
                : needs
                  ? 'needs'
                  : 'available';
      return { ...info, state, status, needs };
    }),
  );
  readonly activeCount = computed(() => this.features().filter(card => card.status === 'active').length);
  readonly pausedCount = computed(() => this.features().filter(card => card.status === 'paused').length);

  readonly cards = computed<IntegrationCard[]>(() => {
    const list: IntegrationCard[] = [
      {
        id: 'whatsapp',
        name: 'WhatsApp Cloud API',
        category: 'Channel',
        status: this.whatsappConnected() ? 'connected' : 'ready',
        summary: this.whatsappConnected()
          ? 'Número vinculado. Revisa el estado del canal antes de recibir mensajes.'
          : 'Conecta tu número con el Phone Number ID y el token de Meta.',
        nextStep: this.whatsappConnected()
          ? 'Revisa el estado del canal en Canales.'
          : 'Conecta WhatsApp para empezar a vender.',
        link: '/app/channels',
      },
      {
        id: 'mercadopago',
        name: 'Mercado Pago',
        category: 'Payments',
        status: this.paymentsProvider() === 'mercadopago' && this.paymentsConfigured() ? 'connected' : 'ready',
        summary: this.paymentsMock()
          ? 'Sin cuenta conectada · los links de pago son simulados (modo de prueba).'
          : this.paymentsProvider() === 'mercadopago' && this.paymentsConfigured()
            ? 'Proveedor de cobros configurado. Revisa el entorno y las notificaciones en Cobros.'
            : 'Sin cuenta conectada · la tienda funciona en modo "pedir por WhatsApp".',
        nextStep: this.paymentsProvider() === 'mercadopago' && this.paymentsConfigured()
          ? 'Revisa credenciales y webhook en Cobros.'
          : 'Conecta tu cuenta de Mercado Pago en Cobros.',
        link: '/app/payments',
      },
      {
        id: 'shopify',
        name: 'Shopify',
        category: 'E-commerce',
        status: 'waitlist',
        summary: 'El conector con Shopify no está disponible para activar.',
        nextStep: 'Aún no disponible. Mientras tanto, carga tus productos en Productos.',
      },
      {
        id: 'shipping',
        name: 'Envíos',
        category: 'Shipping',
        status: 'waitlist',
        summary: 'El conector para etiquetas y seguimiento no está disponible para activar.',
        nextStep: 'Puedes registrar el código de seguimiento en Pedidos.',
      },
      {
        id: 'erp',
        name: 'ERP / stock',
        category: 'ERP',
        status: 'waitlist',
        summary: 'El conector con sistemas de gestión no está disponible para activar.',
        nextStep: 'Mientras tanto, administra tu stock en Inventario.',
      },
    ];

    const filter = this.filter();
    return filter === 'ALL'
      ? list
      : list.filter((item) => item.category === filter);
  });

  constructor() {
    void this.load();
  }

  async toggle(card: FeatureCard): Promise<void> {
    if (this.busyKey() || !this.canManage || this.loading() || this.errorMessage() || !['active', 'paused', 'available'].includes(card.status)) return;
    const enable = card.status !== 'active' && card.status !== 'paused';
    if (
      !enable &&
      !(await this.confirmDialog.confirm({
        title: `¿Desactivar ${card.name}?`,
        message: this.disableWarning(card),
        confirmLabel: 'Desactivar',
        tone: 'danger',
      }))
    ) {
      return;
    }
    if (this.busyKey() || this.loading() || this.errorMessage()) return;
    this.busyKey.set(card.key);
    this.actionError.set(null);
    this.actionSuccess.set(null);
    try {
      this.integrations.set(enable ? await this.api.enable(card.key) : await this.api.disable(card.key));
      this.actionSuccess.set(
        enable
          ? `${card.name} está activa. La encuentras en el menú como «${card.navLabel}».`
          : `Desactivaste ${card.name}.`,
      );
      if (card.key === 'tiktok_live') await this.refreshTikTok();
    } catch (error) {
      this.actionError.set(messageFrom(error, 'No pudimos guardar el cambio. Inténtalo de nuevo.'));
    } finally {
      this.busyKey.set(null);
    }
  }

  open(path: string): void {
    void this.router.navigateByUrl(path);
  }

  featureStatusLabel(card: FeatureCard): string {
    switch (card.status) {
      case 'active':
        return 'Activa';
      case 'available':
        return 'Incluida en tu plan';
      case 'paused':
        return 'En pausa';
      case 'needs':
        return `Requiere ${card.needs?.name ?? 'otra función'}`;
      case 'locked':
        return card.state?.requiredPlan ? `Desde ${card.state.requiredPlan.name}` : 'No incluida';
      default:
        return 'No disponible';
    }
  }

  private disableWarning(card: FeatureCard): string {
    switch (card.key) {
      case 'store': {
        const dependents = this.features()
          .filter((item) => item.state?.requires === 'store' && item.status === 'active')
          .map((item) => item.name);
        const paused = dependents.length
          ? ` En pausa hasta que reactives la tienda, sin perder su configuración: ${dependents.join(' y ')}.`
          : '';
        return `Tu tienda dejará de abrir para tus clientes. Tu vendedor IA sigue vendiendo por chat con fotos, precios y links de pago, solo sin enlaces a la tienda. Tu catálogo, tus pedidos y la configuración de la tienda se conservan.${paused}`;
      }
      case 'custom_domain':
        return 'Tu tienda dejará de abrir en tu dominio y volverá a su dirección de VendedorIA. Puedes activarla de nuevo cuando quieras.';
      case 'instagram':
        return 'Tu vendedor dejará de responder los mensajes de Instagram. Puedes activarla de nuevo cuando quieras.';
      case 'tracking':
        return 'Tu tienda dejará de enviar datos al píxel de Meta y a Google Analytics. Puedes activarla de nuevo cuando quieras.';
      case 'tiktok_live':
        return 'Se pausarán las nuevas reservas y el panel LIVE. Los pedidos ya creados conservan su pago y vencimiento; las reservas pendientes liberan sus unidades al vencer.';
      default:
        return 'Se cancelarán las invitaciones pendientes. Puedes activarla de nuevo cuando quieras.';
    }
  }

  async load(): Promise<void> {
    if (this.busyKey() || this.loadInFlight) return;
    this.loadInFlight = true;
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const [channels, provider] = await Promise.all([
        this.messaging.listChannels(),
        this.orders.getPaymentProvider(),
        this.integrations.refresh(),
      ]);
      this.whatsappConnected.set(
        channels.some(
          (channel) =>
            channel.type === 'WHATSAPP' && Boolean(channel.externalId),
        ),
      );
      this.paymentsMock.set(provider.mockMode);
      this.paymentsProvider.set(provider.provider);
      this.paymentsConfigured.set(provider.configured);
      await this.refreshTikTok();
    } catch {
      this.errorMessage.set('No pudimos cargar el estado de integraciones.');
    } finally {
      this.loading.set(false);
      this.loadInFlight = false;
    }
  }

  setFilter(value: IntegrationCategory): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { category: value === 'ALL' ? null : value }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  changeCategory(event: Event): void {
    if (event.target instanceof HTMLSelectElement) {
      const selected = event.target.value;
      const value = this.categories.find(category => category === selected);
      if (value) this.setFilter(value);
    }
  }

  async refreshTikTok(): Promise<void> {
    this.connectionError.set(null);
    try { this.tiktok.set(await this.liveApi.status()); }
    catch { this.connectionError.set('No pudimos actualizar el estado de TikTok. Las funciones guardadas se conservan.'); }
  }

  async connectTikTok(): Promise<void> {
    if (!this.canManage || this.busyKey() || this.loading() || this.errorMessage() || !this.integrations.isActive('tiktok_live') || !this.tiktok()?.oauthAvailable) return;
    this.busyKey.set('tiktok_live'); this.actionError.set(null);
    this.actionSuccess.set(null);
    try { const result = await this.liveApi.connect(); window.location.assign(result.url); }
    catch (error) { this.actionError.set(messageFrom(error, 'No pudimos iniciar la conexión con TikTok.')); }
    finally { this.busyKey.set(null); }
  }

  async disconnectTikTok(): Promise<void> {
    if (!this.canManage || this.busyKey() || !(await this.confirmDialog.confirm({ title: '¿Desconectar TikTok?', message: 'Se revocará la autorización de la cuenta. Tus campañas y pedidos se conservan.', confirmLabel: 'Desconectar', tone: 'danger' }))) return;
    if (this.busyKey() || this.loading() || this.errorMessage() || !this.tiktok()?.accountId) return;
    this.busyKey.set('tiktok_live'); this.actionError.set(null);
    this.actionSuccess.set(null);
    try { this.tiktok.set(await this.liveApi.disconnect()); this.actionSuccess.set('Cuenta TikTok desconectada.'); }
    catch (error) { this.actionError.set(messageFrom(error, 'No pudimos desconectar TikTok.')); }
    finally { this.busyKey.set(null); }
  }

  statusLabel(status: IntegrationCard['status']): string {
    switch (status) {
      case 'connected':
        return 'Conectado';
      case 'ready':
        return 'Sin conectar';
      default:
        return 'No disponible';
    }
  }

  categoryLabel(category: IntegrationCategory): string {
    return CATEGORY_LABELS[category];
  }
}
