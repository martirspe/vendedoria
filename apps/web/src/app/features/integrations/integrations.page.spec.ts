import { TestBed } from '@angular/core/testing';
import { convertToParamMap, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { DsConfirmService } from '@vendedoria/ui';
import { IntegrationsPage } from './integrations.page';
import { IntegrationsApiService, type IntegrationState } from '../../core/api/integrations-api.service';
import { MessagingApiService } from '../../core/api/messaging-api.service';
import { OrdersApiService } from '../../core/api/orders-api.service';
import { LiveApiService, type TikTokStatus } from '../../core/api/live-api.service';
import { AuthApiService } from '../../core/auth/auth-api.service';

const state: IntegrationState = { key: 'store', active: false, enabled: false, included: true, available: true, requiredPlan: null, requires: null };
const tiktok: TikTokStatus = { enabled: false, oauthAvailable: false, connected: false, healthStatus: 'DISCONNECTED', accountId: null, capabilities: {}, lastCheckedAt: null, lastEventAt: null, errorCode: null, webhook: { configured: false, url: 'https://example.test/webhook', events: [] }, responseMode: 'HUMAN_ONLY', reservationSeconds: 600, maxReservationsPerSession: 10 };
async function setup(states = [state], manager = true) {
  const api = { list: vi.fn<() => Promise<IntegrationState[]>>().mockResolvedValue(states), enable: vi.fn<() => Promise<IntegrationState[]>>().mockResolvedValue([{ ...state, enabled: true, active: true }]), disable: vi.fn<() => Promise<IntegrationState[]>>().mockResolvedValue([state]) };
  const live = { status: vi.fn<() => Promise<TikTokStatus>>().mockResolvedValue(tiktok), connect: vi.fn(), disconnect: vi.fn() };
  const confirm = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const params = new BehaviorSubject(convertToParamMap({}));
  TestBed.configureTestingModule({ imports: [IntegrationsPage], providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { queryParamMap: params, snapshot: { queryParamMap: params.value } } }, { provide: IntegrationsApiService, useValue: api }, { provide: MessagingApiService, useValue: { listChannels: async () => [] } }, { provide: OrdersApiService, useValue: { getPaymentProvider: async () => ({ provider: 'mock', mockMode: true, configured: false }) } }, { provide: LiveApiService, useValue: live }, { provide: AuthApiService, useValue: { isManager: () => manager } }, { provide: DsConfirmService, useValue: { confirm } }] });
  const fixture = TestBed.createComponent(IntegrationsPage); fixture.detectChanges(); await fixture.whenStable();
  await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false)); fixture.detectChanges();
  return { page: fixture.componentInstance, fixture, api, live, confirm, params };
}
beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

describe('Integrations state and actions', () => {
  it('hides unavailable data on load failure and recovers on retry', async () => {
    const { page, fixture, api } = await setup(); api.list.mockRejectedValueOnce(new Error('Offline')); await page.load(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#features-title')).toBeNull(); expect(page.errorMessage()).toBeTruthy();
    await page.load(); fixture.detectChanges(); expect(fixture.nativeElement.querySelector('#features-title')).not.toBeNull();
  });
  it('prevents duplicate mutations and keeps the last state after a failed change', async () => {
    const { page, api } = await setup(); const card = page.features().find(item => item.key === 'store')!;
    let reject!: (reason: Error) => void;
    api.enable.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const saving = page.toggle(card); await page.toggle(card); await page.load();
    expect(api.enable).toHaveBeenCalledTimes(1); expect(api.list).toHaveBeenCalledTimes(1);
    reject(new Error('Offline')); await saving; expect(page.activeCount()).toBe(0); expect(page.busyKey()).toBeNull();
    await page.toggle(card); expect(page.activeCount()).toBe(1); expect(page.actionSuccess()).toBeTruthy();
  });
  it('retains successful activation when the subsequent TikTok status request fails', async () => {
    const { page, api, live } = await setup([{ ...state, key: 'tiktok_live' }]);
    api.enable.mockResolvedValueOnce([{ ...state, key: 'tiktok_live', enabled: true, active: true }]);
    live.status.mockRejectedValueOnce(new Error('Offline')); await page.toggle(page.features().find(item => item.key === 'tiktok_live')!);
    expect(page.integrations.isActive('tiktok_live')).toBe(true); expect(page.actionSuccess()).toBeTruthy(); expect(page.actionError()).toBeNull(); expect(page.connectionError()).toBeTruthy();
  });
  it('guards non-managers and unavailable functions', async () => {
    const { page, api, live } = await setup([state], false); await page.toggle(page.features().find(item => item.key === 'store')!); await page.connectTikTok();
    expect(api.enable).not.toHaveBeenCalled(); expect(live.connect).not.toHaveBeenCalled();
    TestBed.resetTestingModule(); const allowed = await setup(); await allowed.page.toggle(allowed.page.features().find(item => item.key === 'team')!);
    expect(allowed.api.enable).not.toHaveBeenCalled();
  });
  it('rechecks busy state after a pending destructive confirmation', async () => {
    const { page, api, confirm } = await setup([{ ...state, active: true, enabled: true }]);
    let approve!: (value: boolean) => void; confirm.mockImplementationOnce(() => new Promise(resolve => { approve = resolve; }));
    const pending = page.toggle(page.features().find(item => item.key === 'store')!); page.busyKey.set('team'); approve(true); await pending;
    expect(api.disable).not.toHaveBeenCalled();
  });
  it('restores category from URL changes and rejects unknown values', async () => {
    const { page, params } = await setup(); params.next(convertToParamMap({ category: 'Payments' }));
    expect(page.filter()).toBe('Payments'); expect(page.cards().map(card => card.id)).toEqual(['mercadopago']);
    params.next(convertToParamMap({ category: 'unknown' })); expect(page.filter()).toBe('ALL');
  });
});
