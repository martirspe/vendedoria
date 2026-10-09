import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CouponsPage } from './coupons.page';
import { CouponsApiService, type Coupon, type CouponPayload } from '../../core/api/coupons-api.service';
import { StoreApiService } from '../../core/api/store-api.service';
import { IntegrationsStateService } from '../../core/integrations/integrations-state.service';
import { DsConfirmService } from '@vendedoria/ui';

const coupon: Coupon = { id: 'coupon', code: 'VERANO10', method: 'CODE', label: 'Descuento de verano', note: null, kind: 'PERCENT', value: 10, maxDiscountCents: null, buyQuantity: null, getQuantity: null, maxApplications: null, minSubtotalCents: 0, minItems: 0, scope: 'ALL', targets: [], startsAt: null, endsAt: null, usageLimit: null, perCustomerLimit: null, firstOrderOnly: false, isActive: true, applyToSets: true, createdAt: '2026-10-08', usedCount: 0, confirmedCount: 0, discountGivenCents: 0 };
beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

async function setup(fail = false) {
  const api = {
    list: vi.fn(async () => { if (fail) throw new Error('offline'); return [coupon]; }),
    targets: vi.fn(async () => ({ categories: ['Ropa'], brands: [], lines: [], products: [] })),
    create: vi.fn(async (payload: CouponPayload) => ({ ...coupon, ...payload, code: payload.code ?? 'AUTO' })),
    update: vi.fn(async (_id: string, payload: Partial<CouponPayload>) => ({ ...coupon, ...payload })),
    remove: vi.fn(async () => {}),
  };
  TestBed.configureTestingModule({ imports: [CouponsPage], providers: [
    { provide: CouponsApiService, useValue: api }, { provide: StoreApiService, useValue: { get: async () => ({ url: null }) } },
    { provide: IntegrationsStateService, useValue: { isActive: () => true, refresh: async () => {} } },
    { provide: DsConfirmService, useValue: { confirm: async () => true } },
  ] });
  const fixture = TestBed.createComponent(CouponsPage); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false)); fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, api };
}

describe('discount editing and recovery', () => {
  it('shows field errors and blocks invalid amounts, targets and date ranges', async () => {
    const { page, fixture, api } = await setup();
    page.startCreate(); page.form.patchValue({ code: '!', label: ' ', value: 91, scope: 'CATEGORY', startsAt: '2026-10-10T12:00', endsAt: '2026-10-09T12:00' });
    await page.save(); fixture.detectChanges();
    expect(api.create).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[formControlName="code"]').getAttribute('aria-invalid')).toBe('true');
    expect(fixture.nativeElement.textContent).toContain('Selecciona al menos una opción');
    expect(fixture.nativeElement.textContent).toContain('La fecha de fin debe ser posterior');
    expect(page.fieldError('value')).toBeTruthy();
  });

  it('locks saving, ignores duplicate submissions and cancellation, and retains the draft after failure', async () => {
    const { page, fixture, api } = await setup();
    page.startEdit(coupon); page.form.controls.label.setValue('Nombre editado'); page.form.markAsDirty();
    let reject!: (reason: Error) => void;
    api.update.mockImplementationOnce(() => new Promise((_resolve, failure) => { reject = failure; }));
    const saving = page.save(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('[formControlName="label"]').matches(':disabled')).toBe(true);
    page.cancel(); await page.save(); expect(api.update).toHaveBeenCalledTimes(1);
    reject(new Error('offline')); await saving; fixture.detectChanges();
    expect(page.editing()).toBe(coupon); expect(page.form.controls.label.value).toBe('Nombre editado');
    expect(page.hasChanges()).toBe(true); expect(page.errorMessage()).toContain('No se pudo guardar');
  });

  it('preserves fixed-amount cents and adopts the saved response without a second list request', async () => {
    const { page, api } = await setup();
    page.startCreate('FIXED'); page.form.patchValue({ code: 'FIJO10', label: 'Importe de prueba', value: 12.5, minSubtotal: 50 });
    await page.save();
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ value: 1250, minSubtotalCents: 5000 }));
    expect(api.list).toHaveBeenCalledTimes(1); expect(page.editing()).toBeNull();
    expect(page.coupons()[0].value).toBe(1250);
  });

  it('keeps code optional for automatic discounts and marks target changes dirty', async () => {
    const { page, api, fixture } = await setup();
    page.startCreate('FREE_SHIPPING', 'AUTOMATIC'); page.form.controls.label.setValue('Entrega sin costo');
    await page.save(); expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ code: undefined, value: 0 }));
    page.startEdit(coupon); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin cambios');
    page.form.controls.scope.setValue('CATEGORY'); page.toggleTarget('Ropa', true);
    expect(page.hasChanges()).toBe(true); expect(page.selectedTargets()).toEqual(['Ropa']);
  });

  it('recovers failed loading without confusing it with an empty discounts list', async () => {
    const { page, fixture, api } = await setup(true);
    expect(fixture.nativeElement.textContent).toContain('No pudimos cargar los descuentos');
    expect(fixture.nativeElement.textContent).not.toContain('Ofrece descuentos');
    api.list.mockResolvedValueOnce([]); await page.load(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Crea tu primer descuento');
  });

  it('blocks duplicate state changes and keeps the saved status when an update fails', async () => {
    const { page, api } = await setup();
    let reject!: (reason: Error) => void;
    api.update.mockImplementationOnce(() => new Promise((_resolve, failure) => { reject = failure; }));
    const changing = page.toggleActive(coupon); await page.toggleActive(coupon);
    expect(api.update).toHaveBeenCalledTimes(1); expect(page.busyId()).toBe(coupon.id);
    reject(new Error('offline')); await changing;
    expect(page.coupons()[0].isActive).toBe(true); expect(page.busyId()).toBeNull();
    await page.toggleActive(coupon); expect(page.coupons()[0].isActive).toBe(false);
  });

  it('starts each benefit from the empty state without saving or duplicating the page heading', async () => {
    const { page, fixture, api } = await setup();
    page.coupons.set([]); fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('ds-choice-card button') as NodeListOf<HTMLButtonElement>;
    expect(cards).toHaveLength(4);
    cards[3].click(); fixture.detectChanges();
    expect(page.kind()).toBe('FREE_SHIPPING'); expect(page.editing()).toBe('new');
    expect(fixture.nativeElement.querySelectorAll('h1')).toHaveLength(1);
    expect(api.create).not.toHaveBeenCalled();
    page.cancel(); fixture.detectChanges();
    (fixture.nativeElement.querySelectorAll('ds-choice-card button')[1] as HTMLButtonElement).click(); fixture.detectChanges();
    expect(page.kind()).toBe('FIXED');
  });

  it('updates the draft summary while retaining native checkbox form interaction', async () => {
    const { page, fixture } = await setup();
    page.startCreate('FIXED'); page.form.patchValue({ label: 'Beneficio de temporada', value: 12.5, minSubtotal: 50, usageLimit: 20, code: 'FIJO12' }); fixture.detectChanges();
    const summary = fixture.nativeElement.querySelector('.discount-summary') as HTMLElement;
    expect(summary.textContent).toContain('12.50'); expect(summary.textContent).toContain('50.00');
    expect(summary.textContent).toContain('20 en total'); expect(summary.textContent).toContain('FIJO12');
    const firstOrder = fixture.nativeElement.querySelector('[formControlName="firstOrderOnly"]') as HTMLInputElement;
    firstOrder.click(); fixture.detectChanges();
    expect(page.form.controls.firstOrderOnly.value).toBe(true); expect(page.hasChanges()).toBe(true);
    expect(summary.textContent).toContain('Solo primera compra');
  });
});
