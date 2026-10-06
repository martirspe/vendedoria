import { DsModalDirective, DsSelectComponent } from '@vendedoria/ui';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DsButtonComponent } from '@vendedoria/ui';
import { DsEmptyStateComponent } from '@vendedoria/ui';
import { DsIconComponent } from '@vendedoria/ui';
import {
  OrderDto,
  OrderStatus,
  OrdersApiService,
  ProductOption,
} from '../../core/api/orders-api.service';

type ViewMode = 'table' | 'kanban';
type TabMode = 'new' | 'all';

const KANBAN_COLUMNS: Array<{ id: OrderStatus; label: string }> = [
  { id: 'DRAFT', label: 'Borrador' },
  { id: 'PENDING_PAYMENT', label: 'Por pagar' },
  { id: 'PAID', label: 'Pagado' },
  { id: 'FULFILLING', label: 'Preparando' },
  { id: 'SHIPPED', label: 'Enviado' },
  { id: 'COMPLETED', label: 'Completado' },
];

@Component({
  selector: 'app-orders-page',
  standalone: true,
  imports: [DsModalDirective, DsSelectComponent,
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    DsButtonComponent,
    DsEmptyStateComponent,
    DsIconComponent,
  ],
  templateUrl: './orders.page.html',
  styleUrl: './orders.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrdersPage {
  private readonly api = inject(OrdersApiService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private listRequest = 0;

  readonly orders = signal<OrderDto[]>([]);
  readonly products = signal<ProductOption[]>([]);
  readonly selected = signal<OrderDto | null>(null);
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly saving = signal(false);
  readonly view = signal<ViewMode>('kanban');
  readonly tab = signal<TabMode>('new');
  readonly query = signal('');
  readonly statusFilter = signal<OrderStatus | 'ALL'>('ALL');
  readonly mockMode = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly createOpen = signal(false);
  readonly trackingDraft = signal('');
  readonly reconcileDraft = signal('');
  readonly emailPreview = signal<{ subject: string; status: string; safeHtml: SafeHtml } | null>(null);
  private readonly sanitizer = inject(DomSanitizer);

  readonly columns = KANBAN_COLUMNS;

  readonly createForm = this.fb.nonNullable.group({
    productId: ['', Validators.required],
    quantity: [1, [Validators.required, Validators.min(1)]],
    customerName: [''],
    customerPhone: [''],
    createPaymentLink: [true],
  });

  readonly filteredOrders = computed(() => {
    const status = this.statusFilter();
    const list = this.orders();
    if (status === 'ALL') return list;
    return list.filter((order) => order.status === status);
  });

  readonly kanbanBoard = computed(() => {
    const list = this.filteredOrders();
    return this.columns.map((column) => ({
      ...column,
      orders: list.filter((order) => order.status === column.id),
    }));
  });

  constructor() {
    void this.bootstrap();
  }

  async bootstrap(): Promise<void> {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.errorMessage.set(null);
    try {
      const provider = await this.api.getPaymentProvider();
      this.mockMode.set(provider.mockMode);
      await Promise.all([this.load(), this.loadProducts()]);
      const orderId = this.route.snapshot.queryParamMap.get('orderId');
      if (orderId) {
        await this.openOrder(orderId);
      }
    } catch {
      this.loadFailed.set(true);
      this.errorMessage.set('No pudimos cargar pedidos.');
    } finally {
      this.loading.set(false);
    }
  }

  async load(): Promise<void> {
    const request = ++this.listRequest;
    this.loading.set(true);
    this.loadFailed.set(false);
    this.errorMessage.set(null);
    try {
      const orders = await this.api.list({
          tab: this.tab(),
          q: this.query() || undefined,
          status:
            this.tab() === 'all' && this.statusFilter() !== 'ALL'
              ? (this.statusFilter() as OrderStatus)
              : undefined,
        });
      if (request === this.listRequest) this.orders.set(orders);
    } catch {
      if (request === this.listRequest) this.loadFailed.set(true);
    } finally {
      if (request === this.listRequest) this.loading.set(false);
    }
  }

  async loadProducts(): Promise<void> {
    try {
      this.products.set(
        (await this.api.listProducts()).filter((item) => item.isAvailable),
      );
    } catch {
      this.products.set([]);
    }
  }

  setTab(tab: TabMode): void {
    this.tab.set(tab);
    void this.load();
  }

  setView(view: ViewMode): void {
    this.view.set(view);
  }

  onSearch(value: string): void {
    this.query.set(value);
    void this.load();
  }

  onStatusFilter(value: string): void {
    this.statusFilter.set(value as OrderStatus | 'ALL');
    if (this.tab() === 'all') {
      void this.load();
    }
  }

  openCreate(): void {
    this.createOpen.set(true);
    this.createForm.reset({
      productId: this.products()[0]?.id ?? '',
      quantity: 1,
      customerName: '',
      customerPhone: '',
      createPaymentLink: true,
    });
  }

  closeCreate(): void {
    if (this.saving()) return;
    this.createOpen.set(false);
  }

  async createOrder(): Promise<void> {
    if (this.saving()) return;
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    const product = this.products().find(
      (item) => item.id === this.createForm.controls.productId.value,
    );
    if (!product) {
      this.errorMessage.set('Selecciona un producto del catálogo.');
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      const values = this.createForm.getRawValue();
      const order = await this.api.create({
        customerName: values.customerName.trim() || undefined,
        customerPhone: values.customerPhone.trim() || undefined,
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
      });
      this.successMessage.set(
        values.createPaymentLink
          ? 'Pedido creado con link de pago.'
          : 'Pedido creado.',
      );
      this.createOpen.set(false);
      await this.load();
      this.selected.set(order);
    } catch {
      this.errorMessage.set('No se pudo crear el pedido.');
    } finally {
      this.saving.set(false);
    }
  }

  async openOrder(orderId: string): Promise<void> {
    this.trackingDraft.set('');
    this.reconcileDraft.set('');
    try {
      this.selected.set(await this.api.get(orderId));
    } catch {
      this.errorMessage.set('No pudimos abrir el pedido.');
    }
  }

  closeDetail(): void {
    this.selected.set(null);
  }

  async createLink(order: OrderDto): Promise<void> {
    this.saving.set(true);
    try {
      const updated = await this.api.createPaymentLink(
        order.id,
        Boolean(order.conversationId),
      );
      this.selected.set(updated);
      this.successMessage.set('Link de pago generado.');
      await this.load();
    } catch {
      this.errorMessage.set('No se pudo crear el link de pago.');
    } finally {
      this.saving.set(false);
    }
  }

  async simulatePay(order: OrderDto): Promise<void> {
    const payment = order.payments.find((item) => item.status === 'PENDING');
    if (!payment) return;
    this.saving.set(true);
    try {
      await this.api.simulatePayment(payment.id);
      this.successMessage.set('Pago simulado · pedido marcado como Pagado.');
      await this.load();
      this.selected.set(await this.api.get(order.id));
    } catch {
      this.errorMessage.set('No se pudo simular el pago.');
    } finally {
      this.saving.set(false);
    }
  }

  async advance(order: OrderDto, status: OrderStatus): Promise<void> {
    const trackingCode = this.trackingDraft().trim();
    if (status === 'SHIPPED' && this.needsTracking(order) && !trackingCode) {
      this.errorMessage.set('Ingresa el código de seguimiento antes de marcar el envío.');
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      const updated = await this.api.updateStatus(order.id, status, status === 'SHIPPED' ? trackingCode : undefined);
      this.selected.set(updated);
      this.trackingDraft.set('');
      await this.load();
    } catch (error) {
      this.errorMessage.set(this.apiMessage(error) ?? 'Transición de estado no permitida.');
    } finally {
      this.saving.set(false);
    }
  }

  async saveTracking(order: OrderDto): Promise<void> {
    await this.advance(order, 'SHIPPED');
  }

  async reconcile(order: OrderDto): Promise<void> {
    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      const result = await this.api.reconcile(order.id, this.reconcileDraft().trim() || undefined);
      this.successMessage.set(`Mercado Pago ${result.reference}: ${this.providerStatusLabel(result.providerStatus)}.`);
      this.reconcileDraft.set('');
      await this.load();
      this.selected.set(await this.api.get(order.id));
    } catch (error) {
      this.errorMessage.set(this.apiMessage(error) ?? 'No se pudo conciliar el pago.');
    } finally {
      this.saving.set(false);
    }
  }

  async openEmailPreview(order: OrderDto): Promise<void> {
    this.errorMessage.set(null);
    try {
      const preview = await this.api.emailPreview(order.id);
      // Server-rendered email with escaped buyer data; shown in a sandboxed iframe without scripts.
      this.emailPreview.set({ ...preview, safeHtml: this.sanitizer.bypassSecurityTrustHtml(preview.html) });
    } catch (error) {
      this.errorMessage.set(this.apiMessage(error) ?? 'No pudimos generar la vista previa del correo.');
    }
  }

  closeEmailPreview(): void {
    this.emailPreview.set(null);
  }

  isPickup(order: OrderDto): boolean {
    return order.delivery?.mode === 'PICKUP';
  }

  needsTracking(order: OrderDto): boolean {
    return order.channel === 'WEB' && Boolean(order.delivery) && !this.isPickup(order);
  }

  deliveryPlace(order: OrderDto): string {
    const d = order.delivery;
    if (!d) return '';
    return [d.address, d.district, d.province, d.department].filter(Boolean).join(', ');
  }

  private providerStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      processed: 'pago aprobado',
      action_required: 'esperando acción del comprador',
      processing: 'en proceso',
      failed: 'pago rechazado',
      canceled: 'cancelado',
      expired: 'vencido',
      refunded: 'reembolsado',
    };
    return labels[status] ?? status;
  }

  private apiMessage(error: unknown): string | null {
    if (error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500) {
      const message = error.error?.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
    }
    return null;
  }

  async copyLink(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.successMessage.set('Link copiado al portapapeles.');
    } catch {
      this.errorMessage.set('No se pudo copiar el link.');
    }
  }

  formatMoney(cents: number, currency: string): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency,
    }).format(cents / 100);
  }

  /** Every line is a service: nothing is prepared or shipped, the service is carried out. */
  isServicesOnly(order: OrderDto): boolean {
    return order.items.length > 0 && order.items.every((item) => item.product?.kind === 'SERVICE');
  }

  statusLabel(status: OrderStatus, order?: OrderDto): string {
    if (order && this.isPickup(order)) {
      if (status === 'SHIPPED') return 'Listo para recoger';
      if (status === 'COMPLETED') return 'Entregado';
    }
    if (order && this.isServicesOnly(order)) {
      if (status === 'FULFILLING') return 'Por realizar';
      if (status === 'COMPLETED') return 'Realizado';
    }
    switch (status) {
      case 'DRAFT':
        return 'Borrador';
      case 'PENDING_PAYMENT':
        return 'Por pagar';
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
    }
  }

  paymentLabel(status: string): string {
    switch (status) {
      case 'SUCCEEDED':
        return 'Pagado';
      case 'FAILED':
        return 'Fallido';
      case 'CANCELLED':
        return 'Cancelado';
      default:
        return 'Pendiente';
    }
  }

  nextActions(order: OrderDto): Array<{ status: OrderStatus; label: string }> {
    const pickup = this.isPickup(order);
    const ship: { status: OrderStatus; label: string } = {
      status: 'SHIPPED',
      label: pickup ? 'Listo para recoger' : 'Marcar enviado',
    };
    const services = this.isServicesOnly(order);
    const complete: { status: OrderStatus; label: string } = {
      status: 'COMPLETED',
      label: services ? 'Marcar realizado' : order.delivery ? 'Marcar entregado' : 'Completar',
    };
    const prepare: { status: OrderStatus; label: string } = {
      status: 'FULFILLING',
      label: services ? 'Marcar agendado' : 'Preparar',
    };
    switch (order.status) {
      case 'DRAFT':
        return [{ status: 'CANCELLED', label: 'Cancelar' }];
      case 'PENDING_PAYMENT':
        return [{ status: 'CANCELLED', label: 'Cancelar' }];
      case 'PAID':
        return order.delivery ? [prepare, ship, complete] : [prepare, complete];
      case 'FULFILLING':
        return order.delivery ? [ship, complete] : [complete];
      case 'SHIPPED':
        return [complete];
      default:
        return [];
    }
  }

  latestPayment(order: OrderDto) {
    return order.payments[0] ?? null;
  }
}
