import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DsButtonComponent, DsIconComponent } from '@vendedoria/ui';
import {
  AgentsApiService,
  AgentToolTrace,
  PlaygroundMessageDto,
  PlaygroundSessionDto,
} from '../../core/api/agents-api.service';

@Component({
  selector: 'app-seller-playground',
  standalone: true,
  imports: [DsButtonComponent, DsIconComponent],
  templateUrl: './seller-playground.component.html',
  styleUrl: './seller-playground.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SellerPlaygroundComponent implements OnInit {
  private readonly api = inject(AgentsApiService);

  readonly agentId = input<string | null>(null);
  readonly agentName = input('tu vendedor');
  readonly closed = output<void>();

  readonly loading = signal(true);
  readonly sending = signal(false);
  readonly error = signal<string | null>(null);
  readonly session = signal<PlaygroundSessionDto | null>(null);
  readonly draft = signal('');
  readonly lastTools = signal<AgentToolTrace[]>([]);

  readonly messages = computed(() => this.session()?.messages ?? []);

  readonly suggestions = [
    { label: 'Hola', text: 'Hola' },
    { label: 'Busco un regalo', text: 'Busco un regalo, ¿qué me recomiendas?' },
    { label: 'Me parece caro', text: 'Me parece un poco caro' },
    { label: 'Quiero una persona', text: 'Quiero hablar con una persona' },
  ];

  async ngOnInit(): Promise<void> {
    try {
      const session = await this.api.getPlaygroundSession();
      this.session.set(session);
      const lastAgent = [...session.messages]
        .reverse()
        .find((message) => message.authorType === 'SALES_AGENT');
      this.lastTools.set(this.asToolTraces(lastAgent?.toolTraces));
    } catch {
      this.error.set('No pudimos abrir la prueba. Guarda el vendedor y reintenta.');
    } finally {
      this.loading.set(false);
    }
  }

  close(): void {
    this.closed.emit();
  }

  async reset(): Promise<void> {
    const session = this.session();
    if (!session) return;
    this.sending.set(true);
    this.error.set(null);
    try {
      this.session.set(await this.api.resetPlaygroundSession(session.id));
      this.lastTools.set([]);
    } catch {
      this.error.set('No se pudo reiniciar la prueba.');
    } finally {
      this.sending.set(false);
    }
  }

  onDraft(value: string): void {
    this.draft.set(value);
  }

  async send(): Promise<void> {
    const session = this.session();
    const text = this.draft().trim();
    if (!session || !text) return;

    this.sending.set(true);
    this.error.set(null);
    try {
      const result = await this.api.sendPlaygroundMessage(
        session.id,
        text,
        this.agentId() ?? undefined,
      );
      this.session.set(result.session);
      this.lastTools.set(result.lastAgentReply.tools);
      this.draft.set('');
    } catch {
      this.error.set(
        'No se pudo enviar. Revisa productos y preguntas frecuentes e inténtalo otra vez.',
      );
    } finally {
      this.sending.set(false);
    }
  }

  sendSuggestion(text: string): void {
    this.draft.set(text);
    void this.send();
  }

  isBuyer(message: PlaygroundMessageDto): boolean {
    return message.authorType === 'BUYER';
  }

  /** The reply carried a (simulated) payment link, shown to the buyer as a button. */
  hasPaymentButton(message: PlaygroundMessageDto): boolean {
    return this.asToolTraces(message.toolTraces).some(
      (tool) => tool.name === 'create_payment_link' && typeof tool.data?.['checkoutUrl'] === 'string',
    );
  }

  toolLabel(name: string): string {
    switch (name) {
      case 'search_catalog':
        return 'Catálogo';
      case 'get_product_availability':
        return 'Precio / stock';
      case 'lookup_faq':
        return 'Pregunta frecuente';
      case 'create_order':
        return 'Pedido';
      case 'create_payment_link':
        return 'Link de pago';
      case 'quote_shipping':
        return 'Envío';
      case 'escalate':
        return 'Derivó a asesor';
      default:
        return name;
    }
  }

  private asToolTraces(value: unknown): AgentToolTrace[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is AgentToolTrace =>
        typeof item === 'object' &&
        item !== null &&
        'name' in item &&
        'summary' in item,
    );
  }
}
