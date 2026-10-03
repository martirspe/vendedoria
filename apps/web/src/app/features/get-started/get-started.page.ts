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
import { AgentsApiService } from '../../core/api/agents-api.service';
import { CatalogApiService } from '../../core/api/catalog-api.service';
import { MessagingApiService } from '../../core/api/messaging-api.service';
import { OrdersApiService } from '../../core/api/orders-api.service';

type ChecklistItem = {
  id: string;
  title: string;
  body: string;
  done: boolean;
  cta: string;
  link: string;
};

@Component({
  selector: 'app-get-started-page',
  standalone: true,
  imports: [RouterLink, DsButtonComponent, DsIconComponent],
  templateUrl: './get-started.page.html',
  styleUrl: './get-started.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GetStartedPage {
  private readonly agents = inject(AgentsApiService);
  private readonly catalog = inject(CatalogApiService);
  private readonly messaging = inject(MessagingApiService);
  private readonly orders = inject(OrdersApiService);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly agentReady = signal(false);
  readonly hasProduct = signal(false);
  readonly channelReady = signal(false);
  readonly hasConversation = signal(false);
  readonly hasOrder = signal(false);
  readonly agentScore = signal(0);

  readonly items = computed<ChecklistItem[]>(() => [
    {
      id: 'seller',
      title: 'Configura el vendedor',
      body: 'Define su personalidad, preguntas frecuentes y límites, y pruébalo antes de activarlo.',
      done: this.agentReady(),
      cta: 'Ir a Vendedor',
      link: '/app/seller',
    },
    {
      id: 'product',
      title: 'Agrega un producto vendible',
      body: 'Con precio y descripción reales, para que tu vendedor responda con datos correctos.',
      done: this.hasProduct(),
      cta: 'Ir a Productos',
      link: '/app/products',
    },
    {
      id: 'channel',
      title: 'Conecta WhatsApp',
      body: 'Guarda el Phone Number ID y el token de acceso de tu cuenta de Meta.',
      done: this.channelReady(),
      cta: 'Ir a Canales',
      link: '/app/channels',
    },
    {
      id: 'chat',
      title: 'Prueba un mensaje',
      body: 'Escribe a tu número de WhatsApp o usa Probar vendedor para iniciar una conversación.',
      done: this.hasConversation(),
      cta: 'Ir a Mensajes',
      link: '/app/messages',
    },
    {
      id: 'order',
      title: 'Cierra un pedido de prueba',
      body: 'Crea un pedido con link de pago y confirma que el cobro llega.',
      done: this.hasOrder(),
      cta: 'Ir a Pedidos',
      link: '/app/orders',
    },
  ]);

  readonly completedCount = computed(
    () => this.items().filter((item) => item.done).length,
  );

  readonly progressPercent = computed(() => {
    const total = this.items().length;
    if (!total) return 0;
    return Math.round((this.completedCount() / total) * 100);
  });

  readonly readyToSell = computed(() => this.progressPercent() >= 80);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const [agent, products, channels, conversations, orders] =
        await Promise.all([
          this.agents.getPrimary(),
          this.catalog.list(),
          this.messaging.listChannels(),
          this.messaging.listConversations(),
          this.orders.list({ tab: 'all' }),
        ]);

      this.agentScore.set(agent.quality.score);
      this.agentReady.set(
        agent.quality.score >= 80 &&
          Boolean(agent.initialMessage?.trim()) &&
          Boolean(agent.handoffMessage?.trim()),
      );
      this.hasProduct.set(products.some((product) => product.isAvailable));
      this.channelReady.set(
        channels.some(
          (channel) =>
            channel.type === 'WHATSAPP' &&
            (channel.healthStatus === 'CONNECTED' ||
              channel.healthStatus === 'PENDING' ||
              Boolean(channel.externalId)),
        ),
      );
      this.hasConversation.set(conversations.length > 0);
      this.hasOrder.set(orders.length > 0);
    } catch {
      this.errorMessage.set(
        'No pudimos medir tu progreso. Revisa que la API esté en marcha.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
