import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DsButtonComponent } from '@vendedoria/ui';
import { DsIconComponent } from '@vendedoria/ui';
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

const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  ALL: 'Todas',
  Channel: 'Canales',
  Payments: 'Cobros',
  'E-commerce': 'E-commerce',
  Shipping: 'Envíos',
  ERP: 'ERP',
  Marketing: 'Marketing',
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
          ? 'Canal conectado: tu vendedor responde los mensajes de WhatsApp.'
          : 'Conecta tu número con el Phone Number ID y el token de Meta.',
        nextStep: this.whatsappConnected()
          ? 'Revisa el estado del canal en Canales.'
          : 'Conecta WhatsApp para empezar a vender.',
        link: '/app/channels',
      },
      {
        id: 'instagram',
        name: 'Instagram Direct',
        category: 'Channel',
        status: 'waitlist',
        summary: 'Responde los mensajes directos de Instagram con tu vendedor.',
        nextStep: 'Muy pronto. Te avisaremos cuando esté disponible.',
      },
      {
        id: 'mercadopago',
        name: 'Mercado Pago',
        category: 'Payments',
        status: this.paymentsProvider() === 'mercadopago' ? 'connected' : 'ready',
        summary: this.paymentsMock()
          ? 'Sin cuenta conectada · los links de pago son simulados (modo de prueba).'
          : this.paymentsProvider() === 'mercadopago'
            ? 'Cobros con tu propia cuenta: tienda web (tarjeta y Yape) y links del vendedor.'
            : 'Sin cuenta conectada · la tienda funciona en modo "pedir por WhatsApp".',
        nextStep: this.paymentsProvider() === 'mercadopago'
          ? 'Revisa credenciales y webhook en Cobros.'
          : 'Conecta tu cuenta de Mercado Pago en Cobros.',
        link: '/app/payments',
      },
      {
        id: 'shopify',
        name: 'Shopify',
        category: 'E-commerce',
        status: 'waitlist',
        summary: 'Sincroniza tu catálogo y stock desde tu tienda Shopify.',
        nextStep: 'Aún no disponible. Mientras tanto, carga tus productos en Productos.',
      },
      {
        id: 'shipping',
        name: 'Envíos',
        category: 'Shipping',
        status: 'waitlist',
        summary: 'Genera etiquetas y comparte el seguimiento de cada envío.',
        nextStep: 'Muy pronto. Hoy puedes registrar el código de seguimiento en Pedidos.',
      },
      {
        id: 'erp',
        name: 'ERP / stock',
        category: 'ERP',
        status: 'waitlist',
        summary: 'Usa el inventario de tu sistema de gestión como fuente de stock.',
        nextStep: 'Mientras tanto, administra tu stock en Inventario.',
      },
      {
        id: 'ads',
        name: 'Anuncios y remarketing',
        category: 'Marketing',
        status: 'waitlist',
        summary: 'Conecta tus campañas y audiencias con tus ventas.',
        nextStep: 'Aún no disponible.',
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
        return 'Próximamente';
    }
  }

  categoryLabel(category: IntegrationCategory): string {
    return CATEGORY_LABELS[category];
  }
}
