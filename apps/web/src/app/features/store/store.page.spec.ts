import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorePage } from './store.page';
import { StoreApiService, type StoreSettingsView, type UpdateStorePayload } from '../../core/api/store-api.service';
import { IntegrationsStateService } from '../../core/integrations/integrations-state.service';

const storeView: StoreSettingsView = {
  themeStatus: { active: { template: 'classic', version: '1.0.0' }, editing: { template: 'classic', version: '1.0.0' }, activeCompatibility: { status: 'compatible', issues: [] }, compatibility: { status: 'compatible', issues: [] }, update: null },
  availability: { public: false, previewAllowed: true, reason: 'draft' }, url: 'https://prueba.example.test', templateDemoBaseUrl: 'https://prueba.example.test/_templates/', totalProducts: 0, publishedProducts: 0, availableProducts: 0, checklist: [], canPublish: true,
  storefront: { id: 'store', status: 'DRAFT', displayName: 'Mi tienda', tagline: null, logoUrl: null, heroImageUrl: null, brandColor: '#C8F542', accentColor: '#0B0D12', whatsappPhone: null, contactEmail: null, seoTitle: null, seoDescription: null, publishedAt: null, sellerType: 'BUSINESS', legalName: null, ruc: null, legalAddress: null, dni: null, legalDistrict: null, complaintsBookUrl: null, dataBankCode: null, exchangeDays: 0, industry: 'general', template: 'classic' },
};
async function setup(render = false) {
  const params = new BehaviorSubject(convertToParamMap(render ? { seccion: 'identidad' } : {}));
  const navigate = vi.fn().mockResolvedValue(true);
  const update = vi.fn<(payload: UpdateStorePayload) => Promise<StoreSettingsView>>().mockRejectedValue(new Error('Offline'));
  const publish = vi.fn(async () => storeView);
  TestBed.configureTestingModule({ imports: [StorePage], providers: [
    { provide: ActivatedRoute, useValue: { queryParamMap: params } },
    { provide: Router, useValue: { navigate } },
    { provide: StoreApiService, useValue: { get: async () => { if (render) return storeView; throw new Error('Offline'); }, update, publish } },
    { provide: IntegrationsStateService, useValue: { refresh: async () => undefined, isActive: () => true } },
  ] });
  if (!render) TestBed.overrideComponent(StorePage, { set: { template: '' } });
  const fixture = TestBed.createComponent(StorePage); fixture.detectChanges(); await fixture.whenStable();
  await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false)); fixture.detectChanges();
  return { page: fixture.componentInstance, fixture, params, navigate, update, publish };
}
afterEach(() => TestBed.resetTestingModule());
describe('store settings sections', () => {
  it('keeps an unsaved identity when navigating between subsections and falls back to themes', async () => {
    const { page, params } = await setup();
    page.form.controls.displayName.setValue('Mi tienda'); page.form.markAsDirty();
    params.next(convertToParamMap({ seccion: 'legal' })); expect(page.sectionTitle()).toBe('Datos legales');
    params.next(convertToParamMap({ seccion: 'identidad' })); expect(page.form.controls.displayName.value).toBe('Mi tienda'); expect(page.form.dirty).toBe(true);
    params.next(convertToParamMap({ seccion: 'unknown' })); expect(page.section()).toBe('temas');
  });
  it('navigates to a hidden invalid field section and does not submit an invalid payload', async () => {
    const { page, navigate, update } = await setup();
    await page.save(); expect(update).not.toHaveBeenCalled();
    expect(navigate.mock.calls[0][1].queryParams).toEqual({ seccion: 'identidad' });
    page.form.controls.displayName.setValue('Mi tienda'); page.form.controls.ruc.setValue('123');
    await page.save(); expect(navigate.mock.calls[1][1].queryParams).toEqual({ seccion: 'legal' }); expect(update).not.toHaveBeenCalled();
  });
  it('locks native fields while saving and keeps the draft after failure', async () => {
    const { page, fixture, update } = await setup(true);
    page.form.controls.displayName.setValue('Nombre editado'); page.form.markAsDirty();
    let reject!: (reason: Error) => void;
    update.mockImplementationOnce(() => new Promise((_resolve, failure) => { reject = failure; }));
    const saving = page.save(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[formControlName="displayName"]').matches(':disabled')).toBe(true);
    page.discardChanges(); await page.save(); expect(update).toHaveBeenCalledTimes(1);
    reject(new Error('Offline')); await saving; fixture.detectChanges();
    expect(page.form.controls.displayName.value).toBe('Nombre editado'); expect(page.hasChanges()).toBe(true);
    expect(fixture.nativeElement.querySelector('ds-save-bar')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[formControlName="displayName"]').matches(':disabled')).toBe(false);
  });
  it('requires saving or discarding settings before publishing and restores saved configuration', async () => {
    const { page, publish, update } = await setup(true);
    page.form.controls.displayName.setValue('Nombre editado'); page.form.markAsDirty();
    await page.publish(); expect(publish).not.toHaveBeenCalled(); expect(page.errorMessage()).toContain('Guarda o descarta');
    page.discardChanges(); expect(page.form.controls.displayName.value).toBe('Mi tienda'); expect(page.hasChanges()).toBe(false);
    expect(update).not.toHaveBeenCalled(); await page.publish(); expect(publish).toHaveBeenCalledTimes(1);
  });
  it('associates validation messages with the native identity fields', async () => {
    const { page, fixture, update } = await setup(true);
    page.form.controls.contactEmail.setValue('incorrecto'); await page.save(); fixture.detectChanges();
    const field = fixture.nativeElement.querySelector('[formControlName="contactEmail"]') as HTMLInputElement;
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(fixture.nativeElement.querySelector('#' + field.getAttribute('aria-describedby')).textContent).toContain('correo válido');
    expect(update).not.toHaveBeenCalled();
  });
});
