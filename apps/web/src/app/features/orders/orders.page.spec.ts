import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OrdersApiService } from '../../core/api/orders-api.service';
import { OrdersPage } from './orders.page';

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
    expect(fixture.nativeElement.textContent).toContain('No hay pedidos');
  });
});
