import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { DsButtonComponent } from '@vendedoria/ui';
import { DsIconComponent } from '@vendedoria/ui';
import { DsSetupVisualComponent } from '@vendedoria/ui';
import { AgentsApiService } from '../../core/api/agents-api.service';
import { CatalogApiService } from '../../core/api/catalog-api.service';
import { MessagingApiService } from '../../core/api/messaging-api.service';
import { OrdersApiService } from '../../core/api/orders-api.service';
import { environment } from '../../../environments/environment';

type ChecklistItem = {
  id: 'seller' | 'product' | 'channel' | 'chat' | 'order';
  title: string;
  body: string;
  done: boolean;
  cta: string;
  link: string;
};

@Component({
  selector: 'app-get-started-page',
  standalone: true,
  imports: [RouterLink, DsButtonComponent, DsIconComponent, DsSetupVisualComponent],
  templateUrl: './get-started.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GetStartedPage {
  private readonly agents = inject(AgentsApiService);
  private readonly catalog = inject(CatalogApiService);
  private readonly messaging = inject(MessagingApiService);
  private readonly orders = inject(OrdersApiService);

  readonly onboardingUrl = environment.onboardingUrl;
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
      body: 'Conecta el número de tu negocio y verifica que esté listo para recibir mensajes.',
      done: this.channelReady(),
      cta: 'Ir a Canales',
      link: '/app/channels',
    },
    {
      id: 'chat',
      title: 'Recibe tu primera conversación',
      body: 'Escribe al WhatsApp de tu negocio y revisa cómo responde tu vendedor IA.',
      done: this.hasConversation(),
      cta: 'Ir a Mensajes',
      link: '/app/messages',
    },
    {
      id: 'order',
      title: 'Recibe tu primer pedido',
      body: 'Crea un pedido desde una conversación o desde Pedidos y revisa su estado de pago.',
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

  readonly nextStepId = computed(() => this.items().find((item) => !item.done)?.id);
  readonly nextItem = computed(() => this.items().find((item) => !item.done));
  readonly readyToSell = computed(() => this.agentReady() && this.hasProduct() && this.channelReady());

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const [agent, products, channels, conversations, orders] =
        await Promise.all([
          this.agents.getPrimary().catch((error: unknown) => {
            if (error instanceof HttpErrorResponse && error.status === 404) return null;
            throw error;
          }),
          this.catalog.list(),
          this.messaging.listChannels(),
          this.messaging.listConversations(),
          this.orders.list({ tab: 'all' }),
        ]);

      this.agentScore.set(agent?.quality.score ?? 0);
      this.agentReady.set(
        Boolean(agent?.isActive && agent.quality.score >= 80 &&
          agent.initialMessage?.trim() && agent.handoffMessage?.trim()),
      );
      this.hasProduct.set(products.some((product) => product.isAvailable));
      this.channelReady.set(
        channels.some(
          (channel) =>
            channel.type === 'WHATSAPP' &&
            channel.healthStatus === 'CONNECTED',
        ),
      );
      this.hasConversation.set(conversations.length > 0);
      this.hasOrder.set(orders.length > 0);
    } catch {
      this.errorMessage.set(
        'No pudimos cargar tu avance. Revisa tu conexión e inténtalo de nuevo.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
