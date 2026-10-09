import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstagramPage } from './instagram.page';
import { IntegrationsApiService, type InstagramStatus } from '../../core/api/integrations-api.service';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { IntegrationsStateService } from '../../core/integrations/integrations-state.service';
import { DsConfirmService } from '@vendedoria/ui';

const status: InstagramStatus = { channel: { id: 'channel', displayName: 'Cuenta de prueba', externalId: 'account', healthStatus: 'CONNECTED', lastActiveAt: null, metadata: null }, webhook: { callbackUrl: 'https://example.test/callback', verifyTokenConfigured: false, signatureConfigured: false } };
async function setup() {
  const api = { getInstagram: vi.fn(async () => status), connectInstagram: vi.fn<() => Promise<InstagramStatus>>().mockResolvedValue(status), disconnectChannel: vi.fn(async () => {}) };
  TestBed.configureTestingModule({ imports: [InstagramPage], providers: [{ provide: IntegrationsApiService, useValue: api }, { provide: AuthApiService, useValue: { isManager: () => true } }, { provide: IntegrationsStateService, useValue: { isActive: () => true, refresh: async () => {} } }, { provide: DsConfirmService, useValue: { confirm: async () => true } }] });
  const fixture = TestBed.createComponent(InstagramPage); fixture.detectChanges(); await fixture.whenStable();
  await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false)); fixture.detectChanges();
  return { page: fixture.componentInstance, fixture, api };
}
afterEach(() => TestBed.resetTestingModule());
describe('Instagram connection feedback', () => {
  it('distinguishes account connection from platform reception and validates the token', async () => {
    const { page, fixture, api } = await setup(); expect(page.connected()).toBe(true); expect(page.receiving()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Falta habilitar la recepción'); await page.connect(); fixture.detectChanges();
    expect(api.connectInstagram).not.toHaveBeenCalled(); expect(fixture.nativeElement.querySelector('[formControlName="accessToken"]').getAttribute('aria-invalid')).toBe('true');
  });
  it('prevents repeated connection and preserves the form when saving fails', async () => {
    const { page, fixture, api } = await setup(); page.form.controls.accessToken.setValue('x'.repeat(12));
    let reject!: (reason: Error) => void; api.connectInstagram.mockImplementationOnce(() => new Promise((_done, fail) => { reject = fail; }));
    const saving = page.connect(); fixture.detectChanges(); await page.connect();
    expect(api.connectInstagram).toHaveBeenCalledTimes(1); expect(fixture.nativeElement.querySelector('[formControlName="accessToken"]').matches(':disabled')).toBe(true);
    reject(new Error('Offline')); await saving; expect(page.form.controls.accessToken.value).toHaveLength(12); expect(page.operation()).toBeNull();
  });
  it('updates a disconnected account without requiring a second status fetch', async () => {
    const { page, api } = await setup(); await page.disconnect();
    expect(api.disconnectChannel).toHaveBeenCalledWith('channel'); expect(page.status()?.channel).toBeNull(); expect(api.getInstagram).toHaveBeenCalledTimes(1);
  });
});
