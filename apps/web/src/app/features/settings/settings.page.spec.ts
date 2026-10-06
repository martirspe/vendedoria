import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { TenantsApiService } from '../../core/api/tenants-api.service';
import { SettingsPage } from './settings.page';

beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} })));
afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

describe('business settings validation', () => {
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
