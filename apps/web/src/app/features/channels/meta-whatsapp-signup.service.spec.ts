import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetaWhatsAppSignupService } from './meta-whatsapp-signup.service';

const session = { sessionId: 'session', state: 'synthetic-state', expiresAt: new Date(Date.now() + 600000).toISOString(), configId: 'config', appId: 'app', graphVersion: 'v26.0' };
const browser = window as Window & { FB?: unknown };
afterEach(() => { delete browser.FB; TestBed.resetTestingModule(); vi.useRealTimers(); });
describe('Meta SDK lifecycle', () => {
  it('launches synchronously, disables event collection and ignores untrusted session messages', async () => {
    const init = vi.fn();
    let callback!: (response: { authResponse?: { code?: string } }) => void;
    const login = vi.fn((cb: typeof callback, _options: Record<string, unknown>) => { callback = cb; });
    browser.FB = { init, login };
    const sdk = TestBed.inject(MetaWhatsAppSignupService); await sdk.load('app', 'v26.0');
    expect(init).toHaveBeenCalledWith({ appId: 'app', version: 'v26.0', autoLogAppEvents: false, xfbml: false });
    const result = sdk.login(session);
    expect(login).toHaveBeenCalledOnce();
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://fakefacebook.com', data: JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL' }) }));
    callback({ authResponse: { code: 'synthetic-code' } });
    await expect(result).resolves.toBe('synthetic-code');
    expect(login.mock.calls[0][1]).toMatchObject({ response_type: 'code', override_default_response_type: true, extras: { version: 'v4' } });
  });
  it('recovers after user cancellation and removes the pending listener', async () => {
    browser.FB = { init: vi.fn(), login: vi.fn() };
    const sdk = TestBed.inject(MetaWhatsAppSignupService); await sdk.load('app', 'v26.0');
    const pending = sdk.login(session);
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://www.facebook.com', data: JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL' }) }));
    await expect(pending).rejects.toThrow('canceló');
    const retry = sdk.login(session); sdk.cancel(); await expect(retry).rejects.toThrow('canceló');
  });
});
