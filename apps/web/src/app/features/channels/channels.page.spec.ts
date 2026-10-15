import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelsPage } from './channels.page';
import { MessagingApiService, ChannelDto } from '../../core/api/messaging-api.service';
import { MetaWhatsAppSignupService } from './meta-whatsapp-signup.service';

const channel: ChannelDto = { id: 'channel', type: 'WHATSAPP', externalId: '111111', displayName: 'Business', healthStatus: 'CONNECTED', connectionMode: 'NEW_WABA_NUMBER', lastActiveAt: null, metadata: null };
const phone = { id: '111111', wabaId: '654321', displayName: 'Business', displayPhoneNumber: '', registered: false, coexistence: false };
const diagnostics = { connected: false, healthStatus: 'PENDING', checks: [], nextSteps: [] };
const session = { sessionId: 'session', state: 'synthetic-state', expiresAt: new Date(Date.now() + 600000).toISOString(), configId: 'config', appId: 'app', graphVersion: 'v26.0' };
async function setup(canManage = true, available = true) {
  const api = { listChannels: vi.fn().mockResolvedValue([]), getWhatsAppDiagnostics: vi.fn().mockResolvedValue(diagnostics), getWhatsAppSignupConfiguration: vi.fn().mockResolvedValue({ canManage, available, manualAvailable: true, appId: 'app', graphVersion: 'v26.0', message: 'Contacta con soporte.' }), startWhatsAppSignup: vi.fn().mockResolvedValue(session), authorizeWhatsAppSignup: vi.fn().mockResolvedValue({ phones: [phone] }), completeWhatsAppSignup: vi.fn().mockResolvedValue({ channel }), cancelWhatsAppSignup: vi.fn().mockResolvedValue({}), disconnectWhatsApp: vi.fn().mockResolvedValue({}), connectWhatsAppManual: vi.fn(), getWhatsAppManualSetup: vi.fn(), activateWhatsAppManual: vi.fn() };
  const meta = { load: vi.fn().mockResolvedValue(undefined), login: vi.fn().mockResolvedValue('synthetic-code'), cancel: vi.fn() };
  await TestBed.configureTestingModule({ imports: [ChannelsPage], providers: [{ provide: MessagingApiService, useValue: api }, { provide: MetaWhatsAppSignupService, useValue: meta }] }).compileComponents();
  const fixture = TestBed.createComponent(ChannelsPage); await fixture.whenStable(); fixture.detectChanges();
  return { page: fixture.componentInstance, fixture, api, meta };
}
beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });
describe('WhatsApp embedded signup', () => {
  it('prepares SDK and session before a click, exchanges immediately and requires a six-digit PIN', async () => {
    const { page, api, meta, fixture } = await setup();
    expect(meta.load).toHaveBeenCalledOnce(); expect(api.startWhatsAppSignup).toHaveBeenCalledOnce();
    await page.connect(); await page.activate();
    expect(api.authorizeWhatsAppSignup).toHaveBeenCalledWith(session, 'synthetic-code');
    expect(api.completeWhatsAppSignup).not.toHaveBeenCalled();
    page.activationForm.controls.pin.setValue('123456'); await page.activate(); fixture.detectChanges();
    expect(api.completeWhatsAppSignup).toHaveBeenCalledWith(session, phone, '123456');
    expect(page.whatsapp).toEqual(channel); expect(page.activationForm.controls.pin.value).toBe('');
    expect(fixture.nativeElement.querySelector('[formControlName="accessToken"]')).toBeNull();
  });
  it('locks activation and adopts only a verified successful result', async () => {
    const { page, api } = await setup(); await page.connect(); page.activationForm.controls.pin.setValue('123456');
    let finish!: (value: unknown) => void;
    api.completeWhatsAppSignup.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = page.activate(); await page.activate();
    expect(api.completeWhatsAppSignup).toHaveBeenCalledTimes(1); expect(page.whatsapp).toBeUndefined();
    finish({ channel }); await pending; expect(page.whatsapp?.healthStatus).toBe('CONNECTED');
  });
  it('offers retry after cancellation or Meta failure and clears an entered PIN', async () => {
    const { page, api, meta } = await setup(); meta.login.mockRejectedValueOnce(new Error('Cancelado'));
    await page.connect(); expect(page.saving()).toBe(false); expect(page.ready()).toBe(true);
    await page.connect(); page.activationForm.controls.pin.setValue('123456'); api.completeWhatsAppSignup.mockRejectedValueOnce(new Error('Meta unavailable'));
    await page.activate(); expect(page.activationForm.controls.pin.value).toBe(''); expect(page.phones()).toEqual([]); expect(page.whatsapp).toBeUndefined();
  });
  it('does not prepare a privileged flow for agents or an unavailable integration', async () => {
    const { api, meta, fixture } = await setup(false); expect(api.startWhatsAppSignup).not.toHaveBeenCalled(); expect(meta.load).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('El dueño o un administrador');
  });
  it('retains diagnosis and exposes recovery after a failed refresh', async () => {
    const { page, api } = await setup(); api.getWhatsAppDiagnostics.mockRejectedValueOnce(new Error('Offline')); await page.loadDiagnostics();
    expect(page.diagnostics()).toEqual(diagnostics); expect(page.diagnosticsFailed()).toBe(true);
    await page.loadDiagnostics(); expect(page.diagnosticsFailed()).toBe(false);
  });
  it('does not adopt an authorization that completed after the user cancelled', async () => {
    const { page, api } = await setup();
    let finish!: (value: unknown) => void;
    api.authorizeWhatsAppSignup.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = page.connect(); await Promise.resolve();
    await page.cancel(); finish({ phones: [phone] }); await pending;
    expect(page.phones()).toEqual([]); expect(page.ready()).toBe(true);
    expect(api.cancelWhatsAppSignup).toHaveBeenCalled();
  });
});

describe('WhatsApp customer-owned credentials', () => {
  const fields = { appId: '777777', appSecret: 'cd'.repeat(16), accessToken: 'synthetic-customer-system-token', wabaId: '654321', phoneNumberId: '111111' };
  const pendingChannel: ChannelDto = { ...channel, healthStatus: 'PENDING', metadata: { onboarding: 'MANUAL', phoneNumberId: '111111', hasAccessToken: false } };
  const webhook = { callbackUrl: 'https://example.test/webhook', verifyToken: 'synthetic-verify-token', verified: false };
  it('makes manual onboarding available independently of Embedded Signup and validates before submission', async () => {
    const { page, api, meta, fixture } = await setup(true, false);
    expect(page.mode()).toBe('manual'); expect(meta.load).not.toHaveBeenCalled();
    await page.connectManual(); expect(api.connectWhatsAppManual).not.toHaveBeenCalled();
    expect(page.manualForm.controls.appId.touched).toBe(true);
    page.manualForm.setValue(fields); api.connectWhatsAppManual.mockResolvedValueOnce({ channel: pendingChannel, webhook });
    await page.connectManual(); fixture.detectChanges();
    expect(api.connectWhatsAppManual).toHaveBeenCalledWith(fields); expect(page.whatsapp?.healthStatus).toBe('PENDING');
    expect(page.manualForm.controls.accessToken.value).toBe(''); expect(page.manualForm.controls.appSecret.value).toBe('');
    expect(fixture.nativeElement.textContent).toContain('Verificar y activar');
    expect(fixture.nativeElement.querySelector('[formControlName="accessToken"]')).toBeNull();
    expect(page.manualWebhook()).toEqual(webhook);
  });
  it('prevents duplicate submissions and preserves the entered credentials on failure', async () => {
    const { page, api } = await setup(true, false); page.manualForm.setValue(fields);
    let reject!: (error: Error) => void;
    api.connectWhatsAppManual.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const saving = page.connectManual(); await page.connectManual();
    expect(api.connectWhatsAppManual).toHaveBeenCalledTimes(1); reject(new Error('Meta unavailable')); await saving;
    expect(page.manualForm.getRawValue()).toEqual(fields); expect(page.saving()).toBe(false); expect(page.whatsapp).toBeUndefined();
  });
  it('recovers setup loading and activation failures without losing the pending connection', async () => {
    const { page, api } = await setup(true, false); page.channels.set([pendingChannel]);
    api.getWhatsAppManualSetup.mockRejectedValueOnce(new Error('Offline')); await page.loadManualSetup();
    expect(page.setupFailed()).toBe(true); api.getWhatsAppManualSetup.mockResolvedValue(webhook); await page.loadManualSetup();
    expect(page.setupFailed()).toBe(false); expect(page.manualWebhook()).toEqual(webhook);
    api.activateWhatsAppManual.mockRejectedValueOnce(new Error('Webhook not configured')); await page.activateManual();
    expect(page.whatsapp?.healthStatus).toBe('PENDING'); expect(page.errorMessage()).toBeTruthy();
    api.activateWhatsAppManual.mockResolvedValueOnce({ channel: { ...pendingChannel, healthStatus: 'CONNECTED' } }); await page.activateManual();
    expect(page.whatsapp?.healthStatus).toBe('CONNECTED');
  });
  it('guards management and requires disconnect before changing a connected mode', async () => {
    const readonly = await setup(false, false); readonly.page.manualForm.setValue(fields); await readonly.page.connectManual();
    expect(readonly.api.connectWhatsAppManual).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    const { page, api } = await setup(); page.channels.set([channel]); await page.selectMode('manual'); page.manualForm.setValue(fields); await page.connectManual();
    expect(api.connectWhatsAppManual).not.toHaveBeenCalled();
    page.channels.set([pendingChannel]); await page.selectMode('meta'); await page.connect();
    expect(api.authorizeWhatsAppSignup).not.toHaveBeenCalled();
  });
});
