import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DsButtonComponent } from '../../design-system/button/ds-button.component';
import { DsEmptyStateComponent } from '../../design-system/empty-state/ds-empty-state.component';
import { DsIconComponent } from '../../design-system/icon/ds-icon.component';
import {
  ConversationDetail,
  ConversationListItem,
  MessagingApiService,
} from '../../core/api/messaging-api.service';
import {
  OrdersApiService,
  ProductOption,
} from '../../core/api/orders-api.service';

@Component({
  selector: 'app-messages-page',
  standalone: true,
  imports: [
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

  readonly conversations = signal<ConversationListItem[]>([]);
  readonly selected = signal<ConversationDetail | null>(null);
  readonly products = signal<ProductOption[]>([]);
  readonly loadingList = signal(true);
  readonly loadingThread = signal(false);
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
    this.route.queryParamMap.subscribe((params) => {
      this.filterUnattended.set(params.get('unattended') === '1');
      this.filterSales.set(params.get('sale') === '1');
      this.query.set(params.get('q') ?? '');
      void this.loadList();
      const openId = params.get('conversation');
      if (openId) {
        void this.openConversation(openId);
      }
    });
    void this.loadProducts();
    void this.loadTemplates();
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

  async loadList(): Promise<void> {
    this.loadingList.set(true);
    this.errorMessage.set(null);
    try {
      const data = await this.api.listConversations({
        q: this.query() || undefined,
        unattended: this.filterUnattended() || undefined,
        salesOnly: this.filterSales() || undefined,
      });
      this.conversations.set(data);
      const current = this.selected();
      if (current) {
        const stillThere = data.find((item) => item.id === current.id);
        if (!stillThere) {
          this.selected.set(null);
        }
      }
    } catch {
      this.errorMessage.set('No pudimos cargar las conversaciones.');
    } finally {
      this.loadingList.set(false);
    }
  }

  async openConversation(id: string): Promise<void> {
    this.loadingThread.set(true);
    this.notice.set(null);
    this.errorMessage.set(null);
    try {
      this.selected.set(await this.api.getConversation(id));
      this.syncFiltersToUrl(id);
    } catch {
      this.errorMessage.set('No pudimos abrir la conversación.');
    } finally {
      this.loadingThread.set(false);
    }
  }

  async toggleAgent(): Promise<void> {
    const thread = this.selected();
    if (!thread) return;
    await this.api.updateConversation(thread.id, {
      agentEnabled: !thread.agentEnabled,
    });
    await this.openConversation(thread.id);
    await this.loadList();
  }

  async toggleSale(): Promise<void> {
    const thread = this.selected();
    if (!thread) return;
    await this.api.updateConversation(thread.id, {
      markedAsSale: !thread.markedAsSale,
    });
    await this.openConversation(thread.id);
    await this.loadList();
  }

  async toggleUnattended(): Promise<void> {
    const thread = this.selected();
    if (!thread) return;
    await this.api.updateConversation(thread.id, {
      markedUnattended: !thread.markedUnattended,
    });
    await this.openConversation(thread.id);
    await this.loadList();
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
    this.orderModalOpen.set(false);
  }

  async createOrder(): Promise<void> {
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
      this.notice.set(
        values.createPaymentLink
          ? 'Pedido creado y link de pago enviado al chat.'
          : 'Pedido creado desde la conversación.',
      );
      this.orderModalOpen.set(false);
      await this.openConversation(thread.id);
      await this.loadList();
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
      this.notice.set(result.notice);
      await this.openConversation(thread.id);
      await this.loadList();
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
      this.notice.set(result.notice);
      await this.openConversation(thread.id);
      await this.loadList();
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
      case 'lookup_faq':
        return 'FAQ';
      case 'escalate':
        return 'Handoff';
      default:
        return name;
    }
  }
}
