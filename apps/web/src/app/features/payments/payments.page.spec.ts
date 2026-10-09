import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DsConfirmService } from '@vendedoria/ui';
import { PaymentsPage } from './payments.page';
import { PaymentsApiService, type PaymentAccountView, type ConnectPaymentAccountPayload } from '../../core/api/payments-api.service';
import { AuthApiService } from '../../core/auth/auth-api.service';

const credential = 'TEST-' + 'x'.repeat(30);
const account: PaymentAccountView = { provider: 'mercadopago', connected: false, publicKey: null, liveMode: false, externalUserId: null, verifiedAt: null, hasWebhookSecret: false, webhookUrl: 'https://example.test/webhook', simulatorAvailable: false, encryptionConfigured: true };

async function setup(view = account, manager = true) {
  const api = { get: vi.fn<() => Promise<PaymentAccountView>>().mockResolvedValue(view), connect: vi.fn<(payload: ConnectPaymentAccountPayload) => Promise<PaymentAccountView>>().mockResolvedValue({ ...view, connected: true, publicKey: credential }), disconnect: vi.fn<() => Promise<PaymentAccountView>>().mockResolvedValue(account) };
  const confirm = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  TestBed.configureTestingModule({ imports: [PaymentsPage], providers: [{ provide: PaymentsApiService, useValue: api }, { provide: AuthApiService, useValue: { isManager: () => manager } }, { provide: DsConfirmService, useValue: { confirm } }] });
  const fixture = TestBed.createComponent(PaymentsPage);
  fixture.detectChanges(); await fixture.whenStable();
  await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false)); fixture.detectChanges();
  return { page: fixture.componentInstance, fixture, api, confirm };
}
beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

describe('Payment account connection', () => {
  it('validates credentials next to their fields without calling the API', async () => {
    const { page, fixture, api } = await setup(); await page.save(); fixture.detectChanges();
    expect(api.connect).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#payment-accessToken').getAttribute('aria-invalid')).toBe('true');
    expect(fixture.nativeElement.textContent).toContain('Introduce el Access Token');
  });
  it('locks controls, prevents duplicate saves and preserves the draft after failure', async () => {
    const { page, fixture, api } = await setup(); page.form.patchValue({ publicKey: credential, accessToken: credential });
    let reject!: (reason: Error) => void;
    api.connect.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const saving = page.save(); fixture.detectChanges(); await page.save();
    expect(api.connect).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('#payment-accessToken').matches(':disabled')).toBe(true);
    reject(new Error('Offline')); await saving;
    expect(page.form.controls.accessToken.value).toBe(credential); expect(page.operation()).toBeNull();
    await page.save(); expect(page.view()?.connected).toBe(true); expect(page.form.controls.accessToken.value).toBe('');
    expect(api.get).toHaveBeenCalledTimes(1);
  });
  it('preserves boolean environment selection and omits unchanged secrets', async () => {
    const { page, fixture, api } = await setup({ ...account, connected: true, publicKey: credential, hasWebhookSecret: true });
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('#payment-environment');
    select.selectedIndex = 1; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    await page.save(); expect(api.connect).toHaveBeenCalledWith({ publicKey: credential, liveMode: true });
  });
  it('describes a connected test account without promising real payments', async () => {
    const { fixture } = await setup({ ...account, connected: true, publicKey: credential, hasWebhookSecret: true });
    expect(fixture.nativeElement.textContent).toContain('sin dinero real');
    expect(fixture.nativeElement.textContent).not.toContain('ya puede cobrar con tarjeta');
  });
  it('blocks mutation without management permission or secure storage', async () => {
    const { page, api, confirm } = await setup({ ...account, connected: true }, false);
    page.form.patchValue({ publicKey: credential, accessToken: credential }); await page.save(); await page.disconnect();
    expect(api.connect).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    const blocked = await setup({ ...account, encryptionConfigured: false });
    blocked.page.form.patchValue({ publicKey: credential, accessToken: credential }); await blocked.page.save();
    expect(blocked.api.connect).not.toHaveBeenCalled();
  });
  it('rechecks a pending confirmation and preserves the account when disconnection fails', async () => {
    const { page, api, confirm } = await setup({ ...account, connected: true, publicKey: credential });
    let approve!: (answer: boolean) => void;
    confirm.mockImplementationOnce(() => new Promise(resolve => { approve = resolve; }));
    const pending = page.disconnect(); page.saving.set(true); approve(true); await pending;
    expect(api.disconnect).not.toHaveBeenCalled(); page.saving.set(false);
    api.disconnect.mockRejectedValueOnce(new Error('Offline')); await page.disconnect();
    expect(page.view()?.connected).toBe(true); expect(page.errorMessage()).toBeTruthy();
    await page.disconnect(); expect(page.view()?.connected).toBe(false); expect(api.get).toHaveBeenCalledTimes(1);
  });
  it('recovers a failed status load without showing an empty account form', async () => {
    const { page, fixture, api } = await setup(); api.get.mockRejectedValueOnce(new Error('Offline')); await page.load(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('form')).toBeNull(); expect(page.loadFailed()).toBe(true);
    await page.load(); fixture.detectChanges(); expect(page.loadFailed()).toBe(false); expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
  });
});
