import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MetricsPage } from './metrics.page';
import { MetricsApiService, type MetricsSummary } from '../../core/api/metrics-api.service';

const summary: MetricsSummary = { periodDays: 7, from: '2026-10-02T00:00:00Z', to: '2026-10-08T12:00:00Z', currency: 'PEN', conversations: 10, inboundMessages: 20, agentMessages: 15, ordersCreated: 4, paidOrders: 2, revenueCents: 12345, conversionRate: 20, unattendedOpen: 1 };
const empty = { ...summary, conversations: 0, inboundMessages: 0, agentMessages: 0, ordersCreated: 0, paidOrders: 0, revenueCents: 0, conversionRate: 0, unattendedOpen: 0 };
async function setup(data = summary, failure = false) {
  const api = { summary: vi.fn<(days: number) => Promise<MetricsSummary>>().mockResolvedValue(data) };
  if (failure) api.summary.mockRejectedValueOnce(new Error('Offline'));
  const params = new BehaviorSubject(convertToParamMap({}));
  TestBed.configureTestingModule({ imports: [MetricsPage], providers: [provideRouter([]), { provide: MetricsApiService, useValue: api }] });
  Object.defineProperty(TestBed.inject(ActivatedRoute), 'queryParamMap', { get: () => params });
  const fixture = TestBed.createComponent(MetricsPage); fixture.detectChanges(); await fixture.whenStable();
  await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false)); fixture.detectChanges();
  return { page: fixture.componentInstance, fixture, api, params };
}
beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

describe('Metrics summary recovery', () => {
  it('recovers initial failure without displaying a false empty period', async () => {
    const { page, fixture } = await setup(summary, true);
    expect(fixture.nativeElement.textContent).not.toContain('Sin actividad en este período');
    expect(page.errorMessage()).toBeTruthy(); await page.load(); fixture.detectChanges();
    expect(page.summary()).toEqual(summary); expect(page.errorMessage()).toBeNull();
  });
  it('retains the previous period and identifies it when a new query fails', async () => {
    const { page, fixture, api } = await setup(); api.summary.mockRejectedValueOnce(new Error('Offline')); await page.load(30); fixture.detectChanges();
    expect(page.summary()?.periodDays).toBe(7); expect(page.days()).toBe(30);
    expect(fixture.nativeElement.textContent).toContain('correspondientes a 7 días');
  });
  it('ignores duplicate refreshes and responses from superseded periods', async () => {
    const { page, api } = await setup();
    let resolveThirty!: (value: MetricsSummary) => void;
    let resolveSeven!: (value: MetricsSummary) => void;
    api.summary.mockImplementationOnce(() => new Promise(resolve => { resolveThirty = resolve; }));
    api.summary.mockImplementationOnce(() => new Promise(resolve => { resolveSeven = resolve; }));
    const thirty = page.load(30); await page.load(30); const seven = page.load(7);
    expect(api.summary).toHaveBeenCalledTimes(3);
    resolveSeven({ ...summary, conversations: 5 }); await seven;
    resolveThirty({ ...summary, periodDays: 30, conversations: 30 }); await thirty;
    expect(page.summary()?.conversations).toBe(5); expect(page.loading()).toBe(false);
  });
  it('loads URL periods and defaults unknown values to seven days', async () => {
    const { page, api, params } = await setup(); params.next(convertToParamMap({ days: '30' }));
    await vi.waitFor(() => expect(page.loading()).toBe(false)); expect(api.summary).toHaveBeenLastCalledWith(30);
    params.next(convertToParamMap({ days: '90' })); await vi.waitFor(() => expect(page.loading()).toBe(false)); expect(api.summary).toHaveBeenLastCalledWith(7);
  });
  it('shows current unattended work even when the selected period has no activity', async () => {
    const { fixture } = await setup({ ...empty, unattendedOpen: 3 });
    expect(fixture.nativeElement.textContent).toContain('Sin actividad en este período');
    expect(fixture.nativeElement.textContent).toContain('Conversaciones sin atender');
    expect(fixture.nativeElement.querySelector('a[href*="unattended=1"]')).not.toBeNull();
  });
  it('keeps a period with payments or agent messages visible and formats cents accurately', async () => {
    const { page } = await setup(); expect(page.isEmpty({ ...empty, paidOrders: 1, revenueCents: 12345 })).toBe(false);
    expect(page.isEmpty({ ...empty, agentMessages: 1 })).toBe(false);
    expect(page.formatMoney(12345, 'PEN')).toContain('123.45');
  });
});
