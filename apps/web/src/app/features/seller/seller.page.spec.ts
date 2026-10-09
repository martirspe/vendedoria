import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AgentsApiService } from '../../core/api/agents-api.service';
import { KnowledgeApiService } from '../../core/api/knowledge-api.service';
import { MessagingApiService } from '../../core/api/messaging-api.service';
import { SellerPage } from './seller.page';
import { SellerPlaygroundComponent } from './seller-playground.component';

const session = { id: 'test-session', tenantId: 'test-tenant', title: 'Prueba', createdAt: '', updatedAt: '', messages: [] };

async function setupSeller() {
  const api = { list: vi.fn(async () => []), update: vi.fn() };
  TestBed.configureTestingModule({ imports: [SellerPage], providers: [
    provideRouter([]),
    { provide: AgentsApiService, useValue: api },
    { provide: KnowledgeApiService, useValue: { listFaqs: async () => [], listJourneys: async () => [] } },
    { provide: MessagingApiService, useValue: { listChannels: async () => [] } },
  ] });
  const fixture = TestBed.createComponent(SellerPage);
  await fixture.whenStable();
  const page = fixture.componentInstance;
  page.agents.set([{ id: 'test-agent', name: 'Vendedor', isActive: true, isPrimary: true, promptMode: 'guided', channelIds: [] }]);
  page.agentId.set('test-agent');
  page.form.patchValue({ name: 'Vendedor', isActive: true });
  page.quality.set({ score: 240, max: 240, completedFields: 13, totalFields: 13, missingHints: [] });
  fixture.detectChanges();
  return { fixture, page, api };
}

beforeEach(() => vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))));
afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

describe('seller configuration feedback', () => {
  it('does not label a complete configuration as sales readiness', async () => {
    const { fixture, page } = await setupSeller();
    expect(page.qualityLabel()).toBe('Configuración completa');
    expect(fixture.nativeElement.textContent).toContain('Revisa también tu catálogo');
    expect(fixture.nativeElement.textContent).not.toContain('Listo para vender');
  });

  it('keeps the saved active status while a pause is still unsaved', async () => {
    const { fixture, page } = await setupSeller();
    page.form.controls.isActive.setValue(false);
    page.markDirty();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.seller__status').textContent.trim()).toBe('Activo');
    expect(fixture.nativeElement.textContent).toContain('Se aplicarán al guardar.');
    expect(page.currentAgent()?.isActive).toBe(true);
  });

  it('associates the invalid name with an inline error and does not save', async () => {
    const { fixture, page, api } = await setupSeller();
    page.form.controls.name.setValue('A');
    await page.save();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[formControlName="name"]');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('seller-name-error');
    expect(api.update).not.toHaveBeenCalled();
  });
});

describe('playground opening recovery', () => {
  it('clears the opening error and loads a session when retried', async () => {
    const getPlaygroundSession = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(session);
    TestBed.configureTestingModule({ providers: [{ provide: AgentsApiService, useValue: { getPlaygroundSession } }] });
    const page = TestBed.runInInjectionContext(() => new SellerPlaygroundComponent());
    await page.ngOnInit();
    expect(page.error()).not.toBeNull();
    expect(page.loading()).toBe(false);
    expect(page.session()).toBeNull();
    await page.loadSession();
    expect(page.error()).toBeNull();
    expect(page.session()?.id).toBe('test-session');
    expect(page.loading()).toBe(false);
  });

  it('does not send without a session after an opening failure', async () => {
    const sendPlaygroundMessage = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: AgentsApiService, useValue: { getPlaygroundSession: async () => { throw new Error('offline'); }, sendPlaygroundMessage } }] });
    const page = TestBed.runInInjectionContext(() => new SellerPlaygroundComponent());
    await page.ngOnInit();
    page.onDraft('Hola');
    await page.send();
    expect(sendPlaygroundMessage).not.toHaveBeenCalled();
    expect(page.draft()).toBe('Hola');
  });
});
