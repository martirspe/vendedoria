import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorePage } from './store.page';
import { StoreApiService } from '../../core/api/store-api.service';
import { IntegrationsStateService } from '../../core/integrations/integrations-state.service';

async function setup() {
  const params = new BehaviorSubject(convertToParamMap({}));
  const navigate = vi.fn().mockResolvedValue(true);
  const update = vi.fn().mockRejectedValue(new Error('Offline'));
  TestBed.configureTestingModule({ imports: [StorePage], providers: [
    { provide: ActivatedRoute, useValue: { queryParamMap: params } },
    { provide: Router, useValue: { navigate } },
    { provide: StoreApiService, useValue: { get: async () => { throw new Error('Offline'); }, update } },
    { provide: IntegrationsStateService, useValue: { refresh: async () => undefined, isActive: () => true } },
  ] }).overrideComponent(StorePage, { set: { template: '' } });
  const fixture = TestBed.createComponent(StorePage); fixture.detectChanges(); await fixture.whenStable();
  return { page: fixture.componentInstance, params, navigate, update };
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
});
