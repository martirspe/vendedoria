import { DsModalDirective, DsSelectComponent } from '@vendedoria/ui';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { auditTime, tap } from 'rxjs';
import { DsButtonComponent } from '@vendedoria/ui';
import { DsEmptyStateComponent } from '@vendedoria/ui';
import { DsIconComponent } from '@vendedoria/ui';
import { InboxStreamService } from '../../core/api/inbox-stream.service';
import {
  ConversationDetail,
  ConversationListItem,
  MessagingApiService,
} from '../../core/api/messaging-api.service';

/** Distance from the bottom (px) under which a refreshed thread keeps following new messages. */
const FOLLOW_THRESHOLD_PX = 120;
/** Bursts of events (agent text + photos) collapse into one refetch. */
const REFRESH_WINDOW_MS = 300;
import {
  OrdersApiService,
  ProductOption,
} from '../../core/api/orders-api.service';

@Component({
  selector: 'app-messages-page',
  standalone: true,
  imports: [DsModalDirective, DsSelectComponent,
    ReactiveFormsModule,
    DatePipe,
    RouterLink,
    DsButtonComponent,
    DsEmptyStateComponent,
    DsIconComponent,
  ],
  templateUrl: './messages.page.html',
  styleUrl: './messages.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesPage {
  private readonly api = inject(MessagingApiService);
  private readonly ordersApi = inject(OrdersApiService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly inboxStream = inject(InboxStreamService);
  private readonly messageList = viewChild<ElementRef<HTMLElement>>('messageList');
  private threadStale = false;
  private listRequest = 0;
  private threadRequest = 0;

  readonly conversations = signal<ConversationListItem[]>([]);
  readonly selected = signal<ConversationDetail | null>(null);
  readonly products = signal<ProductOption[]>([]);
  readonly loadingList = signal(true);
  readonly loadingThread = signal(false);
  readonly openedConversationId = signal<string | null>(null);
  readonly listError = signal(false);
  readonly threadError = signal(false);
  readonly updatingThread = signal(false);
  readonly sending = signal(false);
  readonly creatingOrder = signal(false);
  readonly orderModalOpen = signal(false);
  readonly filterUnattended = signal(false);
  readonly filterSales = signal(false);
  readonly query = signal('');
  readonly errorMessage = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly lastOrderId = signal<string | null>(null);
  readonly templates = signal<
    Array<{
      id: string;
      name: string;
      language: string;
      category: string;
      body: string;
      description: string;
    }>
  >([]);
  readonly selectedTemplateId = signal('');

  readonly composer = this.fb.nonNullable.group({
    text: ['', [Validators.required, Validators.minLength(1)]],
  });

  readonly orderForm = this.fb.nonNullable.group({
    productId: ['', Validators.required],
    quantity: [1, [Validators.required, Validators.min(1)]],
    createPaymentLink: [true],
    sendLinkToChat: [true],
  });

  readonly canSend = computed(() => {
    const thread = this.selected();
    return Boolean(thread?.messagingWindow.canSendFreeForm);
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.filterUnattended.set(params.get('unattended') === '1');
      this.filterSales.set(params.get('sale') === '1');
      this.query.set(params.get('q') ?? '');
      void this.loadList();
      const openId = params.get('conversation');
      if (openId && openId !== this.openedConversationId()) {
        void this.openConversation(openId);
      }
    });
    void this.loadProducts();
    void this.loadTemplates();

    this.inboxStream
      .events()
      .pipe(
        tap((event) => {
          const current = this.selected();
          if (event.kind === 'reconnected' || event.conversationId === current?.id) {
            this.threadStale = true;
          }
        }),
        auditTime(REFRESH_WINDOW_MS),
        takeUntilDestroyed(),
      )
      .subscribe(() => void this.applyLiveUpdate());
  }

  private async applyLiveUpdate(): Promise<void> {
    const current = this.threadStale ? this.selected() : null;
    this.threadStale = false;
    await Promise.all([
      this.loadList(true),
      current ? this.refreshThread(current.id) : Promise.resolve(),
    ]);
  }

  /** Refetches the open thread without the loading state and follows new messages. */
  private async refreshThread(id: string): Promise<void> {
    try {
      const list = this.messageList()?.nativeElement;
      const follow =
        !list || list.scrollHeight - list.scrollTop - list.clientHeight < FOLLOW_THRESHOLD_PX;
      const thread = await this.api.getConversation(id);
      if (this.selected()?.id !== id) return;
      this.selected.set(thread);
      if (follow) this.scrollToLatest();
    } catch {
      // The next event or a manual reload retries; the current thread stays visible.
    }
  }

  private scrollToLatest(): void {
    afterNextRender(
      () => {
        const list = this.messageList()?.nativeElement;
        if (list) list.scrollTop = list.scrollHeight;
      },
      { injector: this.injector },
    );
  }

  async loadTemplates(): Promise<void> {
    try {
      const data = await this.api.listTemplates();
      this.templates.set(data);
      this.selectedTemplateId.set(data[0]?.id ?? '');
    } catch {
      this.templates.set([]);
    }
  }

  async loadProducts(): Promise<void> {
    try {
      this.products.set(
        (await this.ordersApi.listProducts()).filter((item) => item.isAvailable),
      );
    } catch {
      this.products.set([]);
    }
  }

  /** `silent` refreshes in place (live updates) without the loading or error states. */
  async loadList(silent = false): Promise<void> {
    if (this.destroyRef.destroyed) return;
    const request = ++this.listRequest;
    if (!silent) {
      this.loadingList.set(true);
      this.listError.set(false);
    }
    try {
      const data = await this.api.listConversations({
        q: this.query() || undefined,
        unattended: this.filterUnattended() || undefined,
        salesOnly: this.filterSales() || undefined,
      });
      if (request !== this.listRequest || this.destroyRef.destroyed) return;
      this.conversations.set(data);
      this.listError.set(false);
    } catch {
      if (request === this.listRequest && !silent) this.listError.set(true);
    } finally {
      if (request === this.listRequest) this.loadingList.set(false);
    }
  }

  async openConversation(id: string): Promise<void> {
    if (this.destroyRef.destroyed) return;
    const request = ++this.threadRequest;
    this.openedConversationId.set(id);
    this.loadingThread.set(true);
    this.threadError.set(false);
    this.notice.set(null);
    this.errorMessage.set(null);
    try {
      const thread = await this.api.getConversation(id);
      if (request !== this.threadRequest || this.destroyRef.destroyed) return;
      this.selected.set(thread);
      this.syncFiltersToUrl(id);
      this.scrollToLatest();
    } catch {
      if (request === this.threadRequest) {
        this.threadError.set(true);
        this.selected.set(null);
      }
    } finally {
      if (request === this.threadRequest) this.loadingThread.set(false);
    }
  }

  closeConversation(): void {
    this.threadRequest++;
    this.selected.set(null);
    this.openedConversationId.set(null);
    this.loadingThread.set(false);
    this.threadError.set(false);
    this.errorMessage.set(null);
    this.syncFiltersToUrl();
  }

  async toggleAgent(): Promise<void> {
    const thread = this.selected();
    if (!thread) return;
    await this.updateThread({
      agentEnabled: !thread.agentEnabled,
    });
  }

  async toggleSale(event?: Event): Promise<void> {
    const thread = this.selected();
    if (!thread) return;
    const checkbox = event?.target as HTMLInputElement | null;
    if (checkbox) checkbox.checked = thread.markedAsSale;
    await this.updateThread({
      markedAsSale: !thread.markedAsSale,
    });
  }

  async toggleUnattended(event?: Event): Promise<void> {
    const thread = this.selected();
    if (!thread) return;
    const checkbox = event?.target as HTMLInputElement | null;
    if (checkbox) checkbox.checked = thread.markedUnattended;
    await this.updateThread({
      markedUnattended: !thread.markedUnattended,
    });
  }

  private async updateThread(changes: { agentEnabled?: boolean; markedAsSale?: boolean; markedUnattended?: boolean }): Promise<void> {
    const thread = this.selected();
    if (!thread || this.updatingThread()) return;
    this.updatingThread.set(true);
    this.errorMessage.set(null);
    try {
      await this.api.updateConversation(thread.id, changes);
      if (this.openedConversationId() === thread.id) await this.openConversation(thread.id);
      await this.loadList(true);
      this.notice.set('Conversación actualizada.');
    } catch {
      this.errorMessage.set('No pudimos actualizar la conversación. Inténtalo de nuevo.');
    } finally {
      this.updatingThread.set(false);
    }
  }

  openCreateOrder(): void {
    this.orderModalOpen.set(true);
    this.orderForm.reset({
      productId: this.products()[0]?.id ?? '',
      quantity: 1,
      createPaymentLink: true,
      sendLinkToChat: true,
    });
  }

  closeCreateOrder(): void {
    if (this.creatingOrder()) return;
    this.orderModalOpen.set(false);
  }

  async createOrder(): Promise<void> {
    if (this.creatingOrder()) return;
    const thread = this.selected();
    if (!thread || this.orderForm.invalid) {
      this.orderForm.markAllAsTouched();
      return;
    }
    const product = this.products().find(
      (item) => item.id === this.orderForm.controls.productId.value,
    );
    if (!product) {
      this.errorMessage.set('Agrega un producto al catálogo primero.');
      return;
    }

    this.creatingOrder.set(true);
    this.errorMessage.set(null);
    try {
      const values = this.orderForm.getRawValue();
      const order = await this.ordersApi.create({
        conversationId: thread.id,
        customerName: thread.contactName ?? undefined,
        customerPhone: thread.contactPhone ?? undefined,
        currency: product.currency,
        items: [
          {
            productId: product.id,
            title: product.name,
            quantity: values.quantity,
            unitCents: product.basePriceCents,
          },
        ],
        createPaymentLink: values.createPaymentLink,
        sendLinkToChat: values.sendLinkToChat,
      });
      this.lastOrderId.set(order.id);
      this.orderModalOpen.set(false);
      if (this.openedConversationId() === thread.id) await this.openConversation(thread.id);
      await this.loadList();
      this.notice.set(values.createPaymentLink
        ? (values.sendLinkToChat ? 'Pedido creado y enlace de pago enviado al chat.' : 'Pedido creado con enlace de pago.')
        : 'Pedido creado desde la conversación.');
    } catch {
      this.errorMessage.set('No se pudo crear el pedido desde el chat.');
    } finally {
      this.creatingOrder.set(false);
    }
  }

  formatMoney(cents: number, currency: string): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency,
    }).format(cents / 100);
  }

  async send(): Promise<void> {
    if (this.sending()) return;
    const thread = this.selected();
    if (!thread || this.composer.invalid || !this.canSend()) {
      this.composer.markAllAsTouched();
      return;
    }
    this.sending.set(true);
    this.errorMessage.set(null);
    try {
      const result = await this.api.sendMessage(
        thread.id,
        this.composer.controls.text.value.trim(),
      );
      this.composer.reset({ text: '' });
      if (this.openedConversationId() === thread.id) await this.openConversation(thread.id);
      await this.loadList();
      this.notice.set(result.notice);
    } catch {
      this.errorMessage.set(
        'No se pudo enviar. Revisa la ventana de 24h de Meta o el estado del canal.',
      );
    } finally {
      this.sending.set(false);
    }
  }

  onTemplateChange(value: string): void {
    this.selectedTemplateId.set(value);
  }

  async sendTemplate(): Promise<void> {
    if (this.sending()) return;
    const thread = this.selected();
    const templateId = this.selectedTemplateId();
    if (!thread || !templateId) return;
    this.sending.set(true);
    this.errorMessage.set(null);
    try {
      const result = await this.api.sendTemplate(thread.id, {
        templateId,
        variables: [thread.contactName || 'cliente'],
      });
      if (this.openedConversationId() === thread.id) await this.openConversation(thread.id);
      await this.loadList();
      this.notice.set(result.notice);
    } catch {
      this.errorMessage.set(
        'No se pudo enviar la plantilla. Revisa el canal WhatsApp.',
      );
    } finally {
      this.sending.set(false);
    }
  }

  onSearch(value: string): void {
    this.query.set(value);
    this.syncFiltersToUrl(this.selected()?.id);
    void this.loadList();
  }

  toggleUnattendedFilter(): void {
    this.filterUnattended.update((value) => !value);
    this.syncFiltersToUrl(this.selected()?.id);
    void this.loadList();
  }

  toggleSalesFilter(): void {
    this.filterSales.update((value) => !value);
    this.syncFiltersToUrl(this.selected()?.id);
    void this.loadList();
  }

  channelLabel(type: string): string {
    switch (type) {
      case 'WHATSAPP': return 'WhatsApp';
      case 'INSTAGRAM': return 'Instagram';
      case 'TIKTOK_LIVE': return 'TikTok LIVE';
      default: return 'Canal';
    }
  }

  orderStatusLabel(status: string): string {
    switch (status) {
      case 'DRAFT':
        return 'Borrador';
      case 'PENDING_PAYMENT':
        return 'Pago pendiente';
      case 'PAID':
        return 'Pagado';
      case 'FULFILLING':
        return 'Preparando';
      case 'SHIPPED':
        return 'Enviado';
      case 'COMPLETED':
        return 'Completado';
      case 'CANCELLED':
        return 'Cancelado';
      default:
        return status;
    }
  }

  paymentStatusLabel(status: string | null): string {
    switch (status) {
      case 'PENDING':
        return 'Cobro pendiente';
      case 'SUCCEEDED':
        return 'Cobro confirmado';
      case 'FAILED':
        return 'Cobro fallido';
      case 'CANCELLED':
        return 'Cobro cancelado';
      default:
        return 'Sin pago';
    }
  }

  private syncFiltersToUrl(conversationId?: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        unattended: this.filterUnattended() ? '1' : null,
        sale: this.filterSales() ? '1' : null,
        q: this.query() || null,
        conversation: conversationId ?? null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  preview(item: ConversationListItem): string {
    return item.messages[0]?.body ?? 'Sin mensajes';
  }

  initials(item: ConversationListItem | ConversationDetail): string {
    const source = item.contactName || item.contactPhone || '?';
    return source.slice(0, 2).toUpperCase();
  }

  /** Photo URL when the message is a product image sent by the agent. */
  messageImage(message: ConversationDetail['messages'][number]): string | null {
    const meta = message.metadata;
    return meta?.kind === 'image' && typeof meta.imageUrl === 'string' ? meta.imageUrl : null;
  }

  /** Payment link the buyer received as a button under this message (older messages carry it in the text). */
  messagePaymentLink(message: ConversationDetail['messages'][number]): string | null {
    const url = message.metadata?.checkoutUrl;
    return typeof url === 'string' && !message.body.includes(url) ? url : null;
  }

  messageTools(
    message: ConversationDetail['messages'][number],
  ): Array<{ name: string; status: string; summary: string }> {
    const tools = message.metadata?.tools;
    if (!Array.isArray(tools)) return [];
    return tools.filter(
      (tool) =>
        tool &&
        typeof tool === 'object' &&
        typeof tool.name === 'string' &&
        typeof tool.summary === 'string',
    );
  }

  toolLabel(name: string): string {
    switch (name) {
      case 'search_catalog':
        return 'Catálogo';
      case 'get_product_availability':
        return 'Precio / stock';
      case 'create_order':
        return 'Pedido';
      case 'create_payment_link':
        return 'Link de pago';
      case 'quote_shipping':
        return 'Envío';
      case 'lookup_faq':
        return 'FAQ';
      case 'escalate':
        return 'Derivó a asesor';
      default:
        return name;
    }
  }
}
