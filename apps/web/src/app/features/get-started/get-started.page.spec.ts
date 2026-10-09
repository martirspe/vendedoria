import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AgentsApiService } from '../../core/api/agents-api.service';
import { CatalogApiService } from '../../core/api/catalog-api.service';
import { MessagingApiService } from '../../core/api/messaging-api.service';
import { OrdersApiService } from '../../core/api/orders-api.service';
import { GetStartedPage } from './get-started.page';

async function setup(healthStatus = 'CONNECTED', isActive = true, fail = false, missingSeller = false) {
  const catalog = { list: vi.fn(async () => {
    if (fail) throw new Error('unavailable');
    return [{ isAvailable: true }];
  }) };
  TestBed.configureTestingModule({ imports: [GetStartedPage], providers: [
    provideRouter([]),
    { provide: AgentsApiService, useValue: { getPrimary: async () => {
      if (missingSeller) throw new HttpErrorResponse({ status: 404 });
      return { quality: { score: 240, max: 240 }, isActive, initialMessage: 'Hola', handoffMessage: 'Te atendemos' };
    } } },
    { provide: CatalogApiService, useValue: catalog },
    { provide: MessagingApiService, useValue: { listChannels: async () => [{ type: 'WHATSAPP', healthStatus, externalId: 'qa-channel' }], listConversations: async () => [{}] } },
    { provide: OrdersApiService, useValue: { list: async () => [{}] } },
  ] });
  const fixture = TestBed.createComponent(GetStartedPage);
  fixture.detectChanges();
  await fixture.whenStable();
  await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, catalog };
}

afterEach(() => TestBed.resetTestingModule());

describe('onboarding readiness and recovery', () => {
  it('renders the seller score against the API maximum', async () => {
    const { fixture } = await setup();
    expect(fixture.nativeElement.textContent).toContain('240/240 puntos');
    expect(fixture.nativeElement.textContent).not.toContain('/200');
  });

  it('distinguishes the next step from completed steps with visible labels', async () => {
    const { fixture } = await setup('DISCONNECTED');
    const rows = Array.from(fixture.nativeElement.querySelectorAll('ol li')) as HTMLElement[];
    expect(rows.filter((row) => row.textContent?.includes('Completado'))).toHaveLength(4);
    expect(rows.find((row) => row.textContent?.includes('Conecta WhatsApp'))?.textContent).toContain('Siguiente paso');
    expect(fixture.nativeElement.querySelector('#setup-next-title').textContent).toBe('Conecta WhatsApp');
  });
  it('treats a missing seller as an incomplete step rather than a failed dashboard', async () => {
    const { page } = await setup('CONNECTED', true, false, true);
    expect(page.errorMessage()).toBeNull();
    expect(page.agentReady()).toBe(false);
    expect(page.nextStepId()).toBe('seller');
    expect(page.progressPercent()).toBe(80);
  });
  it.each(['PENDING', 'DEGRADED', 'DISCONNECTED'])('does not treat %s with an external ID as ready', async (health) => {
    const { page } = await setup(health);
    expect(page.progressPercent()).toBe(80);
    expect(page.channelReady()).toBe(false);
    expect(page.readyToSell()).toBe(false);
  });

  it('requires an active seller before announcing readiness', async () => {
    const { page } = await setup('CONNECTED', false);
    expect(page.agentReady()).toBe(false);
    expect(page.readyToSell()).toBe(false);
  });

  it('hides unknown progress on a failed request and recovers from the visible retry', async () => {
    const { fixture, page, catalog } = await setup('CONNECTED', true, true);
    expect(fixture.nativeElement.querySelector('[role="progressbar"]')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('0%');
    expect(fixture.nativeElement.textContent).not.toContain('Agrega un producto vendible');
    catalog.list.mockResolvedValue([{ isAvailable: true }]);
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(page.loading()).toBe(false));
    fixture.detectChanges();
    expect(page.errorMessage()).toBeNull();
    expect(page.readyToSell()).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('100');
  });
});
