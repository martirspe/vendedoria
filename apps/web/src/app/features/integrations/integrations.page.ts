import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DsButtonComponent } from '../../design-system/button/ds-button.component';
import { DsIconComponent } from '../../design-system/icon/ds-icon.component';
import { MessagingApiService } from '../../core/api/messaging-api.service';
import { OrdersApiService } from '../../core/api/orders-api.service';

type IntegrationCategory =
  | 'ALL'
  | 'Channel'
  | 'Payments'
  | 'E-commerce'
  | 'Shipping'
  | 'ERP'
  | 'Marketing';

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
  imports: [RouterLink, DsButtonComponent, DsIconComponent],
  templateUrl: './integrations.page.html',
  styleUrl: './integrations.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IntegrationsPage {
  private readonly messaging = inject(MessagingApiService);
  private readonly orders = inject(OrdersApiService);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly filter = signal<IntegrationCategory>('ALL');
  readonly whatsappConnected = signal(false);
  readonly paymentsMock = signal(true);
  readonly paymentsProvider = signal('mock');

  readonly categories: IntegrationCategory[] = [
    'ALL',
    'Channel',
    'Payments',
    'E-commerce',
    'Shipping',
    'ERP',
    'Marketing',
  ];

  readonly cards = computed<IntegrationCard[]>(() => {
    const list: IntegrationCard[] = [
      {
        id: 'whatsapp',
        name: 'WhatsApp Cloud API',
        category: 'Channel',
        status: this.whatsappConnected() ? 'connected' : 'ready',
        summary: this.whatsappConnected()
          ? 'Canal conectado · webhook y simulación local disponibles.'
          : 'Listo para conectar Phone Number ID + token.',
        nextStep: this.whatsappConnected()
          ? 'Revisa salud en Canales o simula un inbound.'
          : 'Conecta WhatsApp para empezar a vender.',
        link: '/app/channels',
      },
      {
        id: 'instagram',
        name: 'Instagram Direct',
        category: 'Channel',
        status: 'waitlist',
        summary: 'Adapter Meta en roadmap. El enum ya existe en dominio.',
        nextStep: 'Únete a la waitlist interna · sin promesas falsas.',
      },
      {
        id: 'mercadopago',
        name: 'Mercado Pago',
        category: 'Payments',
        status: this.paymentsMock() ? 'ready' : 'connected',
        summary: this.paymentsMock()
          ? `Provider ${this.paymentsProvider()} · checkout mock (flujo B).`
          : 'Checkout live vía Mercado Pago (flujo B).',
        nextStep: this.paymentsMock()
          ? 'Deja el token vacío para mock o configura MERCADOPAGO_ACCESS_TOKEN.'
          : 'Webhooks de pago activos en Pedidos.',
        link: '/app/orders',
      },
      {
        id: 'shopify',
        name: 'Shopify',
        category: 'E-commerce',
        status: 'waitlist',
        summary: 'Sync de catálogo y stock vía conector versionado.',
        nextStep: 'Roadmap honesto · aún no hay sync automático.',
      },
      {
        id: 'shipping',
        name: 'Envíos',
        category: 'Shipping',
        status: 'waitlist',
        summary: 'Etiquetas y tracking sin acoplar el dominio al courier.',
        nextStep: 'Próximo: waitlist de operadores logísticos.',
      },
      {
        id: 'erp',
        name: 'ERP / stock',
        category: 'ERP',
        status: 'waitlist',
        summary: 'Inventario externo como fuente de verdad.',
        nextStep: 'Mientras tanto usa stock del catálogo VendedorIA.',
      },
      {
        id: 'ads',
        name: 'Ads / remarketing',
        category: 'Marketing',
        status: 'waitlist',
        summary: 'Campañas y audiencias sin clonar stacks ajenos.',
        nextStep: 'Fuera del smoke path actual.',
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

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const [channels, provider] = await Promise.all([
        this.messaging.listChannels(),
        this.orders.getPaymentProvider(),
      ]);
      this.whatsappConnected.set(
        channels.some(
          (channel) =>
            channel.type === 'WHATSAPP' && Boolean(channel.externalId),
        ),
      );
      this.paymentsMock.set(provider.mockMode);
      this.paymentsProvider.set(provider.provider);
    } catch {
      this.errorMessage.set('No pudimos cargar el estado de integraciones.');
    } finally {
      this.loading.set(false);
    }
  }

  setFilter(value: IntegrationCategory): void {
    this.filter.set(value);
  }

  statusLabel(status: IntegrationCard['status']): string {
    switch (status) {
      case 'connected':
        return 'Conectado';
      case 'ready':
        return 'Listo';
      default:
        return 'Waitlist';
    }
  }
}
