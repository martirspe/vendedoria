import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StoreEditorPage } from './store-editor.page';
import { StoreApiService, type StoreEditorState, type StoreEditorView } from '../../core/api/store-api.service';
import type { StoreTemplateContent } from '@vendedoria/contracts';
import { CatalogApiService } from '../../core/api/catalog-api.service';
import { IntegrationsStateService } from '../../core/integrations/integrations-state.service';
import { DsConfirmService } from '@vendedoria/ui';

const state: StoreEditorState = { template: 'classic', themeVersion: '1.0.0', content: { version: 1, sections: {} }, hasUnpublishedChanges: false, scheduledAt: null, savedAt: '2026-10-08T12:00:00Z' };
const editorView: StoreEditorView = {
  ...state, template: 'classic', frameUrl: 'https://store.example.test/', frameExpiresAt: '2026-10-09', storeStatus: 'DRAFT', aiText: false,
  themeStatus: { active: { template: 'classic', version: '1.0.0' }, editing: { template: 'classic', version: '1.0.0' }, activeCompatibility: { status: 'compatible', issues: [] }, compatibility: { status: 'compatible', issues: [] }, update: null },
  defaultLayout: [{ id: 'hero', type: 'hero' }, { id: 'catalog', type: 'catalog' }],
  sections: [
    { id: 'hero', label: 'Portada', role: 'builtin', canHide: true, faq: false, fields: [{ id: 'title', label: 'Título principal', kind: 'text', maxLength: 100 }] },
    { id: 'catalog', label: 'Catálogo', role: 'builtin', canHide: false, faq: false, fields: [] },
    { id: 'footer', label: 'Pie de página', role: 'fixed', canHide: false, faq: false, fields: [] },
    { id: 'product', label: 'Producto', role: 'fixed', page: 'product', canHide: false, faq: false, fields: [] },
    { id: 'text', label: 'Texto', description: 'Historia de tu marca', role: 'block', canHide: true, faq: false, fields: [{ id: 'title', label: 'Título', kind: 'text', maxLength: 100 }] },
  ],
  theme: { options: [], defaults: { primary: '#C8F542', accent: '#0B0D12', font: 'modern', corners: 'soft', logo: '', favicon: '', background: '#FFFFFF', surface: '#FFFFFF', text: '#0B0D12', muted: '#5B6472', border: '#E6E8EE', container: 'standard', spacing: 'standard', typeScale: 'standard' } },
};
async function setup(render = false) {
  const api = { editor: vi.fn<() => Promise<StoreEditorView>>().mockRejectedValue(new Error('Offline')), publishDraft: vi.fn<() => Promise<StoreEditorState>>(), saveDraft: vi.fn<(content: StoreTemplateContent, savedAt?: string) => Promise<StoreEditorState>>().mockRejectedValue(new Error('Offline')) };
  if (render) api.editor.mockResolvedValue(editorView);
  TestBed.configureTestingModule({ imports: [StoreEditorPage], providers: [
    { provide: StoreApiService, useValue: api }, { provide: CatalogApiService, useValue: {} },
    provideRouter([]),
    { provide: IntegrationsStateService, useValue: { refresh: async () => {}, isActive: () => true } },
    { provide: DsConfirmService, useValue: { confirm: async () => false } },
  ] });
  if (!render) TestBed.overrideComponent(StoreEditorPage, { set: { template: '' } });
  const fixture = TestBed.createComponent(StoreEditorPage); fixture.detectChanges(); await fixture.whenStable();
  await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
  fixture.componentInstance.frameReady.set(true); fixture.detectChanges();
  for (const element of fixture.nativeElement.querySelectorAll('*')) element.scrollIntoView = vi.fn();
  return { page: fixture.componentInstance, fixture, api };
}
afterEach(() => TestBed.resetTestingModule());
describe('store editor action recovery', () => {
  it('ignores repeated publication while a request is pending', async () => {
    const { page, api } = await setup();
    let resolve!: (value: StoreEditorState) => void;
    api.publishDraft.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const publishing = page.publish(); await Promise.resolve(); await page.publish();
    expect(api.publishDraft).toHaveBeenCalledTimes(1); expect(page.busy()).toBe('publish');
    resolve(state); await publishing; expect(page.busy()).toBeNull();
  });
  it('keeps edited content and blocks publication when autosave fails', async () => {
    const { page, api } = await setup();
    const content = { version: 1 as const, sections: { hero: { title: 'Borrador editado' } } };
    page.content.set(content); await page.retrySave(); await page.publish();
    expect(page.content()).toEqual(content); expect(page.saveState()).toBe('error');
    expect(api.publishDraft).not.toHaveBeenCalled(); expect(page.busy()).toBeNull();
  });
  it('finds sections without accents and preserves the selected draft when searching', async () => {
    const { page } = await setup(); page.view.set(editorView);
    page.selectSection('hero'); page.sectionQuery.set('catalogo');
    expect(page.filteredBodySections().map(s => s.id)).toEqual(['catalog']);
    expect(page.selectedSection()).toBe('hero'); expect(page.content()).toEqual(state.content);
    page.sectionQuery.set('titulo'); expect(page.filteredBodySections().map(s => s.id)).toEqual(['hero']);
    page.panelTab.set('style'); page.selectSection('footer');
    expect(page.panelTab()).toBe('sections'); expect(page.sectionQuery()).toBe(''); expect(page.selectedSection()).toBe('footer');
    page.selectSection('missing'); expect(page.selectedSection()).toBe('footer');
  });
  it('edits the selected section from its inspector instead of duplicating fields in navigation', async () => {
    const { page, fixture } = await setup(true);
    const navigation = fixture.nativeElement.querySelector('.editor__navigator') as HTMLElement;
    (navigation.querySelector('[data-section="hero"] .section__head') as HTMLButtonElement).click(); fixture.detectChanges();
    const field = fixture.nativeElement.querySelector('.editor__panel #field-hero-title') as HTMLInputElement;
    expect(field).toBeTruthy(); expect(navigation.querySelector('#field-hero-title')).toBeNull();
    field.value = 'Portada editada'; field.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    expect(page.content().sections['hero']['title']).toBe('Portada editada'); expect(page.canUndo()).toBe(true);
    const nativeUndo = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }); field.dispatchEvent(nativeUndo);
    expect(nativeUndo.defaultPrevented).toBe(false); expect(page.content().sections['hero']['title']).toBe('Portada editada');
  });
  it('inserts a searched block below the selection and supports undo', async () => {
    const { page } = await setup(); page.view.set(editorView); page.selectSection('hero');
    page.libraryQuery.set('historia'); expect(page.filteredLibrary()).toHaveLength(1);
    page.addSection(page.filteredLibrary()[0]);
    expect(page.layout().map(s => s.type)).toEqual(['hero', 'text', 'catalog']); expect(page.section()?.role).toBe('block'); expect(page.libraryQuery()).toBe('');
    page.undo(); expect(page.layout().map(s => s.type)).toEqual(['hero', 'catalog']);
  });
  it('saves a draft with Ctrl+S without publishing', async () => {
    const { page, api } = await setup();
    api.saveDraft.mockResolvedValue({ ...state, hasUnpublishedChanges: true });
    page.view.set(editorView); page.editFromPanel('hero', editorView.sections[0].fields[0], 'Borrador');
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true }); page.onKeydown(event);
    await vi.waitFor(() => expect(page.saveState()).toBe('saved'));
    expect(event.defaultPrevented).toBe(true); expect(api.saveDraft).toHaveBeenCalledTimes(1); expect(api.publishDraft).not.toHaveBeenCalled();
  });
  it('deduplicates preview refresh and keeps edited content when refreshing fails', async () => {
    const { page, api } = await setup(); const draft = { version: 1 as const, sections: { hero: { title: 'Texto pendiente' } } }; page.content.set(draft);
    let reject!: (reason: Error) => void; api.editor.mockImplementationOnce(() => new Promise((_done, failure) => { reject = failure; }));
    const refreshing = page.reloadFrame(); await page.reloadFrame(); expect(api.editor).toHaveBeenCalledTimes(2);
    reject(new Error('Offline')); await refreshing; expect(page.content()).toEqual(draft); expect(page.refreshingFrame()).toBe(false); expect(page.notice()?.tone).toBe('danger');
  });
});
