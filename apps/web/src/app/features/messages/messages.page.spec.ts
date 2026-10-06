import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { NEVER } from 'rxjs';
import { InboxStreamService } from '../../core/api/inbox-stream.service';
import { MessagingApiService, type ConversationDetail } from '../../core/api/messaging-api.service';
import { OrdersApiService } from '../../core/api/orders-api.service';
import { MessagesPage } from './messages.page';

const thread = (id: string): ConversationDetail => ({
  id, contactName: 'Cliente de prueba', contactPhone: null, status: 'OPEN', agentEnabled: true,
  markedAsSale: false, markedUnattended: false, updatedAt: '2026-10-06T00:00:00Z',
  channel: { id: 'qa-channel', type: 'WHATSAPP', healthStatus: 'CONNECTED', displayName: null },
  messages: [], linkedOrder: null,
  messagingWindow: { canSendFreeForm: true, closesAt: null, reason: null },
});

async function setup(fail = false) {
  const api = {
    listConversations: vi.fn(async () => { if (fail) throw new Error('unavailable'); return []; }),
    listTemplates: async () => [],
    getConversation: vi.fn(async (id: string) => thread(id)),
    updateConversation: vi.fn<() => Promise<void>>(async () => { throw new Error('unavailable'); }),
  };
  TestBed.configureTestingModule({ imports: [MessagesPage], providers: [
    provideRouter([]),
    { provide: MessagingApiService, useValue: api },
    { provide: OrdersApiService, useValue: { listProducts: async () => [] } },
    { provide: InboxStreamService, useValue: { events: () => NEVER } },
  ] });
  vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(MessagesPage);
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, api };
}

afterEach(() => TestBed.resetTestingModule());

describe('inbox recovery and selection', () => {
  it('distinguishes failure from an empty inbox and offers retry', async () => {
    const { fixture, page, api } = await setup(true);
    expect(fixture.nativeElement.textContent).toContain('No pudimos cargar las conversaciones');
    expect(fixture.nativeElement.textContent).not.toContain('Sin conversaciones todavía');
    api.listConversations.mockResolvedValue([]);
    (fixture.nativeElement.querySelector('ds-empty-state button') as HTMLButtonElement).click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(page.listError()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Sin conversaciones todavía');
  });

  it('keeps the last selected conversation when an earlier request resolves late', async () => {
    const { page, api } = await setup();
    let finishFirst!: (value: ConversationDetail) => void;
    api.getConversation.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
    const first = page.openConversation('first');
    await page.openConversation('second');
    finishFirst(thread('first'));
    await first;
    expect(page.selected()?.id).toBe('second');
    expect(page.openedConversationId()).toBe('second');
    await page.loadList(true);
    expect(page.selected()?.id).toBe('second');
  });

  it('reports a failed takeover without changing ownership or leaving controls busy', async () => {
    const { fixture, page } = await setup();
    await page.openConversation('qa');
    await page.toggleAgent();
    fixture.detectChanges();
    expect(page.selected()?.agentEnabled).toBe(true);
    expect(page.updatingThread()).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('No pudimos actualizar');
  });

  it('can return to the list while a thread request is still pending', async () => {
    const { page, api } = await setup();
    let finish!: (value: ConversationDetail) => void;
    api.getConversation.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const opening = page.openConversation('qa');
    page.closeConversation();
    finish(thread('qa')); await opening;
    expect(page.selected()).toBeNull();
    expect(page.openedConversationId()).toBeNull();
    expect(page.loadingThread()).toBe(false);
  });

  it('restores a checkbox when the server rejects the change', async () => {
    const { fixture, page } = await setup();
    await page.openConversation('qa'); fixture.detectChanges();
    const checkbox = fixture.nativeElement.querySelector('.thread-head input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(page.errorMessage()).not.toBeNull());
    expect(checkbox.checked).toBe(false);
    expect(page.selected()?.markedAsSale).toBe(false);
  });

  it('does not reopen a conversation after returning to the list during an update', async () => {
    const { page, api } = await setup();
    await page.openConversation('qa');
    api.getConversation.mockClear();
    let finish!: () => void;
    api.updateConversation.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const updating = page.toggleAgent();
    page.closeConversation();
    finish(); await updating;
    expect(page.selected()).toBeNull();
    expect(page.openedConversationId()).toBeNull();
    expect(api.getConversation).not.toHaveBeenCalled();
  });
});
