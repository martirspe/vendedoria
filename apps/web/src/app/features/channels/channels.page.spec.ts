import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelsPage } from './channels.page';
import { MessagingApiService, type ChannelDto, type ChannelDiagnostics } from '../../core/api/messaging-api.service';

const channel: ChannelDto = { id: 'channel', type: 'WHATSAPP', connectionMode: 'NEW_WABA_NUMBER', healthStatus: 'CONNECTED', externalId: 'number', displayName: 'Canal de prueba', lastActiveAt: null, metadata: null };
const diagnostics: ChannelDiagnostics = { connected: true, healthStatus: 'CONNECTED', checks: [], nextSteps: [] };
async function setup() {
  const result = { channel, webhook: { callbackUrl: 'https://example.test/callback', verifyTokenConfigured: true, verifyTokenHint: 'Configuración disponible' } };
  const api = { listChannels: vi.fn(async () => []), getWhatsAppDiagnostics: vi.fn<() => Promise<ChannelDiagnostics>>().mockResolvedValue(diagnostics), connectWhatsApp: vi.fn<() => Promise<typeof result>>().mockResolvedValue(result), simulateInbound: vi.fn(async () => ({})) };
  TestBed.configureTestingModule({ imports: [ChannelsPage], providers: [{ provide: MessagingApiService, useValue: api }] });
  const fixture = TestBed.createComponent(ChannelsPage); fixture.detectChanges(); await fixture.whenStable();
  await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false)); fixture.detectChanges();
  return { page: fixture.componentInstance, fixture, api };
}
beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });
describe('WhatsApp connection recovery', () => {
  it('shows validation and blocks an invalid connection', async () => {
    const { page, fixture, api } = await setup(); await page.connect(); fixture.detectChanges();
    expect(api.connectWhatsApp).not.toHaveBeenCalled(); expect(fixture.nativeElement.querySelector('[formControlName="accessToken"]').getAttribute('aria-invalid')).toBe('true');
  });
  it('locks native controls, keeps credentials after failure and adopts the saved response', async () => {
    const { page, fixture, api } = await setup(); page.connectForm.patchValue({ phoneNumberId: 'number', accessToken: 'x'.repeat(12) });
    let reject!: (reason: Error) => void; api.connectWhatsApp.mockImplementationOnce(() => new Promise((_done, fail) => { reject = fail; }));
    const saving = page.connect(); fixture.detectChanges(); await page.connect();
    expect(api.connectWhatsApp).toHaveBeenCalledTimes(1); expect(fixture.nativeElement.querySelector('[formControlName="phoneNumberId"]').matches(':disabled')).toBe(true);
    reject(new Error('Offline')); await saving; expect(page.connectForm.controls.accessToken.value).toHaveLength(12);
    await page.connect(); expect(page.whatsapp).toEqual(channel); expect(page.connectForm.controls.accessToken.value).toBe(''); expect(api.listChannels).toHaveBeenCalledTimes(1);
  });
  it('keeps the last diagnosis available and exposes recovery when refresh fails', async () => {
    const { page, api } = await setup(); api.getWhatsAppDiagnostics.mockRejectedValueOnce(new Error('Offline')); await page.loadDiagnostics();
    expect(page.diagnostics()).toEqual(diagnostics); expect(page.diagnosticsFailed()).toBe(true);
    await page.loadDiagnostics(); expect(page.diagnosticsFailed()).toBe(false);
  });
});
