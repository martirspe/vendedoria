import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { OrdersApiService, type OrderDto } from '../../core/api/orders-api.service';
import { OrdersPage } from './orders.page';
import { readOrderList } from './order-list';

beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} })));
afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

describe('orders recovery', () => {
  it('does not invite creating an order when the list request failed, and retries', async () => {
    const api = {
      getPaymentProvider: async () => ({ mockMode: false }),
      listProducts: async () => [],
      list: vi.fn(async () => { throw new Error('unavailable'); return []; }),
    };
    TestBed.configureTestingModule({ imports: [OrdersPage], providers: [provideRouter([]), { provide: OrdersApiService, useValue: api }] });
    const fixture = TestBed.createComponent(OrdersPage);
    fixture.detectChanges(); await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false)); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No pudimos cargar los pedidos');
    expect(fixture.nativeElement.textContent).not.toContain('No hay pedidos');
    expect((fixture.nativeElement.querySelector('header ds-button button') as HTMLButtonElement).disabled).toBe(true);
    api.list.mockResolvedValue([]);
    (fixture.nativeElement.querySelector('ds-empty-state button') as HTMLButtonElement).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false)); fixture.detectChanges();
    expect(fixture.componentInstance.loadFailed()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('No hay pedidos pendientes');
  });
});

describe('order list UX', () => {
  const order = (status: OrderDto['status']): OrderDto => ({
    id: 'test-order', status, channel: 'WEB', delivery: null, serviceNote: null, trackingCode: null,
    currency: 'PEN', totalCents: 1000, customerName: 'Cliente de prueba', customerPhone: null,
    conversationId: null, createdAt: '2026-10-07T12:00:00Z', updatedAt: '2026-10-07T12:00:00Z',
    items: [], payments: [], conversation: null,
  });

  async function setup(initial: Record<string, string> = {}, data: OrderDto[] = []) {
    const params = new BehaviorSubject(convertToParamMap(initial));
    const api = { getPaymentProvider: async () => ({ mockMode: true }), listProducts: async () => [], list: vi.fn(async () => data),
      get: vi.fn(async (id: string): Promise<OrderDto> => ({ ...order('PAID'), id, trackingCode: 'TRACK-123' })), create: vi.fn(async () => order('DRAFT')) };
    TestBed.configureTestingModule({ imports: [OrdersPage], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { queryParamMap: params, snapshot: { queryParamMap: convertToParamMap(initial) } } },
      { provide: OrdersApiService, useValue: api },
    ] });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(OrdersPage);
    fixture.detectChanges(); await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false)); fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, api, params, navigate };
  }

  it('restores search, status and board from the URL and keeps cancelled orders visible', async () => {
    const { page, fixture, api } = await setup({ pestana: 'todos', vista: 'kanban', estado: 'CANCELLED', q: 'prueba' }, [order('CANCELLED')]);
    expect(api.list).toHaveBeenCalledWith({ tab: 'all', status: 'CANCELLED', q: 'prueba' });
    expect(page.kanbanBoard()).toMatchObject([{ id: 'CANCELLED', orders: [{ id: 'test-order' }] }]);
    expect(fixture.nativeElement.textContent).toContain('Cliente de prueba');
    expect(page.summary().total).toBe(1);
  });

  it('shows a search-empty recovery instead of prompting creation and clears the URL filters', async () => {
    const { page, fixture, params, api, navigate } = await setup({ pestana: 'todos', q: 'sin coincidencia', estado: 'PAID' });
    expect(fixture.nativeElement.textContent).toContain('No hay coincidencias');
    expect(fixture.nativeElement.querySelector('ds-empty-state').textContent).not.toContain('Crear pedido');
    page.clearFilters();
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { q: null, estado: null }, queryParamsHandling: 'merge' }));
    params.next(convertToParamMap({ pestana: 'todos' }));
    await fixture.whenStable(); fixture.detectChanges();
    expect(api.list).toHaveBeenLastCalledWith({ tab: 'all', q: undefined, status: undefined });
    expect(fixture.nativeElement.textContent).toContain('Aún no hay pedidos');
  });

  it('debounces search and changes view without losing the current query', async () => {
    const { page, navigate } = await setup();
    page.onSearch('pri'); page.onSearch('primero');
    expect(navigate).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { q: 'primero' }, replaceUrl: true })));
    page.onSearch('segundo'); page.setView('kanban');
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { vista: 'kanban', q: 'segundo' } }));
  });

  it('uses a readable list by default and ignores unsupported URL values', () => {
    expect(readOrderList(convertToParamMap({ vista: 'unsupported', estado: 'unknown' }))).toEqual({ tab: 'new', view: 'table', query: '', status: 'ALL' });
  });

  it('shows loading immediately, ignores older responses, and does not reopen a closed detail', async () => {
    const { page, fixture, api } = await setup();
    let resolveFirst!: (value: OrderDto) => void;
    api.get.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
    const first = page.openOrder('first'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Cargando detalle del pedido"]')).not.toBeNull();
    await page.openOrder('second');
    resolveFirst({ ...order('PAID'), id: 'first' }); await first;
    expect(page.selected()?.id).toBe('second');
    let resolveClosed!: (value: OrderDto) => void;
    api.get.mockImplementationOnce(() => new Promise(resolve => { resolveClosed = resolve; }));
    const closed = page.openOrder('closed');
    page.closeDetail();
    resolveClosed({ ...order('PAID'), id: 'closed' }); await closed; fixture.detectChanges();
    expect(page.selected()).toBeNull();
    expect(page.detailLoading()).toBe(false);
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
  });

  it('retries a failed order detail and hydrates the existing tracking code', async () => {
    const { page, fixture, api } = await setup();
    api.get.mockRejectedValueOnce(new Error('offline'));
    await page.openOrder('retry'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog').textContent).toContain('No pudimos abrir el pedido');
    (fixture.nativeElement.querySelector('dialog ds-empty-state button') as HTMLButtonElement).click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(api.get).toHaveBeenLastCalledWith('retry');
    expect(page.selected()?.id).toBe('retry');
    expect(page.detailFailed()).toBe(false);
    expect(page.trackingDraft()).toBe('TRACK-123');
  });

  it('updates the product subtotal and prevents submitting fractional or missing quantities', async () => {
    const { page, fixture, api } = await setup();
    page.products.set([{ id: 'product', name: 'Producto de prueba', basePriceCents: 1250, currency: 'PEN', isAvailable: true }]);
    page.errorMessage.set('Mensaje anterior'); page.openCreate(); fixture.detectChanges();
    expect(page.errorMessage()).toBeNull();
    page.createForm.controls.quantity.setValue(3);
    expect(page.createSummary()).toMatchObject({ totalCents: 3750, quantity: 3 });
    for (const quantity of [0, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      page.createForm.controls.quantity.setValue(quantity); fixture.detectChanges();
      (fixture.nativeElement.querySelector('ds-button[type="submit"] button') as HTMLButtonElement).click();
      await fixture.whenStable(); fixture.detectChanges();
      expect(page.createSummary()).toBeNull();
      expect(fixture.nativeElement.querySelector('#order-quantity-error').textContent).toContain('cantidad entera');
      expect(api.create).not.toHaveBeenCalled();
    }
    page.createForm.controls.quantity.setValue(2); fixture.detectChanges();
    expect(page.createForm.valid).toBe(true);
    expect(page.errorMessage()).toBeNull();
    expect(fixture.nativeElement.querySelector('#order-quantity-error')).toBeNull();
    expect(page.createSummary()?.totalCents).toBe(2500);
  });

  it('submits a valid order from the dialog button instead of cancelling the submit event', async () => {
    const { page, fixture, api } = await setup();
    page.products.set([{ id: 'product', name: 'Producto de prueba', basePriceCents: 1250, currency: 'PEN', isAvailable: true }]);
    page.openCreate(); page.createForm.patchValue({ quantity: 2, createPaymentLink: false }); fixture.detectChanges();
    (fixture.nativeElement.querySelector('ds-button[type="submit"] button') as HTMLButtonElement).click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(api.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ createPaymentLink: false, items: [{ productId: 'product', title: 'Producto de prueba', quantity: 2, unitCents: 1250 }] }));
    expect(page.createOpen()).toBe(false);
    expect(page.selected()?.status).toBe('DRAFT');
  });

  it('does not offer a new charge for cancelled or already-paid orders', async () => {
    const { page, fixture } = await setup();
    for (const status of ['CANCELLED', 'PAID', 'COMPLETED'] as const) {
      page.selected.set(order(status)); fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('dialog').textContent).not.toContain('Generar enlace de pago');
      expect(page.canCollect(order(status))).toBe(false);
      await page.createLink(order(status));
      expect(page.saving()).toBe(false);
    }
    page.selected.set(order('PENDING_PAYMENT')); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog').textContent).toContain('Generar enlace de pago');
  });
});
