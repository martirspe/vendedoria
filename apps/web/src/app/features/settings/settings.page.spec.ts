import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { TenantsApiService, type UpdateTenantPayload } from '../../core/api/tenants-api.service';
import { SettingsPage } from './settings.page';

beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} })));
afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

const business = { name: 'Negocio QA', country: 'PE', currency: 'PEN' };
async function setup(initial = business) {
  const api = { getMe: vi.fn<() => Promise<typeof business>>().mockResolvedValue(initial), updateMe: vi.fn<(payload: UpdateTenantPayload) => Promise<typeof business>>().mockResolvedValue(business) };
  TestBed.configureTestingModule({ imports: [SettingsPage], providers: [{ provide: TenantsApiService, useValue: api }] });
  const fixture = TestBed.createComponent(SettingsPage); fixture.detectChanges(); await fixture.whenStable();
  await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false)); fixture.detectChanges();
  return { page: fixture.componentInstance, fixture, api };
}

describe('business settings validation', () => {
  it('validates the trimmed name and prevents silent invalid payloads', async () => {
    const { page, fixture, api } = await setup(); page.form.controls.name.setValue(' a '); await page.save(); fixture.detectChanges();
    expect(api.updateMe).not.toHaveBeenCalled(); expect(page.fieldError('name')).toContain('al menos 2');
    expect(fixture.nativeElement.querySelector('#settings-name').getAttribute('aria-invalid')).toBe('true');
  });
  it('locks fields and discard, prevents duplicate saves and retains edits after failure', async () => {
    const { page, fixture, api } = await setup(); page.form.controls.name.setValue('Otro negocio');
    let reject!: (reason: Error) => void;
    api.updateMe.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const saving = page.save(); fixture.detectChanges(); await page.save(); page.discard(); await page.load();
    expect(api.updateMe).toHaveBeenCalledTimes(1); expect(api.getMe).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('#settings-name').matches(':disabled')).toBe(true);
    reject(new Error('Offline')); await saving;
    expect(page.form.controls.name.value).toBe('Otro negocio'); expect(page.savedSettings()?.name).toBe(business.name); expect(page.hasChanges()).toBe(true);
  });
  it('normalizes the payload and adopts the server response as the saved state', async () => {
    const { page, api } = await setup(); page.form.patchValue({ name: '  Nuevo negocio  ', country: 'mx', currency: 'USD' });
    const updated = { name: 'Nuevo negocio', country: 'MX', currency: 'USD' }; api.updateMe.mockResolvedValueOnce(updated); await page.save();
    expect(api.updateMe).toHaveBeenCalledWith(updated); expect(page.savedSettings()).toEqual(updated); expect(page.form.getRawValue()).toEqual(updated); expect(page.hasChanges()).toBe(false);
    await page.save(); expect(api.updateMe).toHaveBeenCalledTimes(1);
  });
  it('discards locally and preserves an existing currency outside the common list', async () => {
    const { page, fixture, api } = await setup({ ...business, currency: 'EUR' });
    expect(fixture.nativeElement.querySelector('option[value="EUR"]')).not.toBeNull(); page.form.patchValue({ name: 'Borrador', currency: 'USD' });
    page.discard(); expect(page.form.getRawValue()).toEqual({ ...business, currency: 'EUR' }); expect(page.hasChanges()).toBe(false); expect(api.updateMe).not.toHaveBeenCalled();
  });
  it('recovers a failed load without presenting an editable empty form', async () => {
    const { page, fixture, api } = await setup(); api.getMe.mockRejectedValueOnce(new Error('Offline')); await page.load(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('form')).toBeNull(); expect(page.loadFailed()).toBe(true);
    await page.load(); fixture.detectChanges(); expect(page.loadFailed()).toBe(false); expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
  });
  it('keeps invalid country and blank names from reaching the API and displays inline feedback', async () => {
    const api = { getMe: async () => ({ name: 'Negocio QA', country: 'PE', currency: 'PEN' }), updateMe: vi.fn() };
    TestBed.configureTestingModule({ imports: [SettingsPage], providers: [{ provide: TenantsApiService, useValue: api }] });
    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges(); await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
    const page = fixture.componentInstance;
    page.form.patchValue({ name: '   ', country: '1!' });
    await page.save(); fixture.detectChanges();
    expect(api.updateMe).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#settings-name-error').textContent).toContain('al menos 2');
    expect(fixture.nativeElement.querySelector('#settings-country-error').textContent).toContain('2 letras');
    expect(fixture.nativeElement.querySelector('[formControlName="country"]').getAttribute('aria-invalid')).toBe('true');
  });
});
