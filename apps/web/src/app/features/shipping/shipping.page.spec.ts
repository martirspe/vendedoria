import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ShippingApiService, type ShippingSettingsView } from '../../core/api/shipping-api.service';
import { ShippingPage } from './shipping.page';

const saved: ShippingSettingsView = {
  deliveryEnabled: true, freeShippingFromCents: null, pickupEnabled: false,
  pickupAddress: null, shippingOriginUbigeo: '150101', carrierRates: { olva: [900, 1200, 1600, 2200, 2800] },
  options: [{ mode: 'OLVA', label: 'Olva Courier', cents: 900, eta: null, byDistance: true }],
};

beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

async function setup(fail = false) {
  const api = {
    get: vi.fn(async () => { if (fail) throw new Error('offline'); return saved; }),
    ubigeos: vi.fn(async () => [{ code: '150101', department: 'Lima', province: 'Lima', district: 'Lima' }]),
    update: vi.fn(async () => saved),
  };
  TestBed.configureTestingModule({ imports: [ShippingPage], providers: [{ provide: ShippingApiService, useValue: api }] });
  const fixture = TestBed.createComponent(ShippingPage);
  fixture.detectChanges(); await fixture.whenStable();
  await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false)); fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, api };
}

describe('shipping configuration feedback', () => {
  it('keeps saved options distinct from pending changes and preserves them after a failed save', async () => {
    const { fixture, page, api } = await setup();
    page.form.controls.olvaEnabled.setValue(false); page.form.markAsDirty(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cambios sin guardar');
    const summary = fixture.nativeElement.querySelector('[aria-label="Opciones de entrega guardadas"]');
    expect(summary.textContent).toContain('Olva Courier');
    expect(summary.textContent).toContain('Guarda los cambios');
    api.update.mockRejectedValueOnce(new Error('offline'));
    await page.save(); fixture.detectChanges();
    expect(page.form.dirty).toBe(true);
    expect(page.options()).toEqual(saved.options);
    expect(fixture.nativeElement.textContent).toContain('No se pudo guardar');
  });

  it('shows field errors and does not submit invalid shipping amounts', async () => {
    const { fixture, page, api } = await setup();
    page.form.controls.freeShippingFrom.setValue(0);
    page.form.controls.olva.controls[0].setValue(-1);
    await page.save(); fixture.detectChanges();
    expect(api.update).not.toHaveBeenCalled();
    const threshold = fixture.nativeElement.querySelector('[formControlName="freeShippingFrom"]');
    expect(threshold.getAttribute('aria-invalid')).toBe('true');
    expect(fixture.nativeElement.querySelector('#free-shipping-error').textContent).toContain('al menos S/ 1');
    expect(fixture.nativeElement.querySelector('#olva-rate-0').textContent).toContain('tarifa entre');
  });

  it('requires a new district after changing the origin province', async () => {
    const { fixture, page, api } = await setup();
    page.setOriginProvince('Lima');
    await page.save(); fixture.detectChanges();
    expect(page.form.controls.shippingOriginUbigeo.value).toBe('');
    expect(api.update).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Selecciona el distrito desde donde despachas');
  });

  it('recovers a failed load without showing editable defaults as saved configuration', async () => {
    const { fixture, page, api } = await setup(true);
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No pudimos cargar tus envíos');
    await page.save(); expect(api.update).not.toHaveBeenCalled();
    api.get.mockResolvedValue(saved);
    (fixture.nativeElement.querySelector('ds-empty-state button') as HTMLButtonElement).click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(page.loadError()).toBe(false);
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
    expect(page.form.pristine).toBe(true);
  });

  it('blocks duplicate saves and adopts the returned configuration only after success', async () => {
    const { fixture, page, api } = await setup();
    let resolve!: (value: ShippingSettingsView) => void;
    api.update.mockImplementationOnce(() => new Promise(result => { resolve = result; }));
    page.form.controls.pickupEnabled.setValue(true);
    page.form.controls.pickupAddress.setValue('Local de prueba'); page.form.markAsDirty();
    const saving = page.save(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(true);
    await page.save(); expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith(expect.objectContaining({ carrierRates: saved.carrierRates }));
    resolve({ ...saved, pickupEnabled: true, pickupAddress: 'Local de prueba', options: [...saved.options, { mode: 'PICKUP', label: 'Recojo en tienda', cents: 0, eta: 'Local de prueba', byDistance: false }] });
    await saving; fixture.detectChanges();
    expect(page.form.pristine).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Configuración guardada');
    expect(fixture.nativeElement.querySelector('[aria-label="Opciones de entrega guardadas"]').textContent).toContain('Recojo en tienda');
  });
});
