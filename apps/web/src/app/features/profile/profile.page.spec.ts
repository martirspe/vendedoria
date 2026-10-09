import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DsConfirmService } from '@vendedoria/ui';
import { AccountApiService, type AccountProfile } from '../../core/api/account-api.service';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { ProfilePage } from './profile.page';

const account: AccountProfile = { id: 'test-account', email: 'account@example.test', fullName: 'Usuario de prueba', role: 'OWNER', business: { name: 'Negocio de prueba' }, memberSince: '2026-10-01T12:00:00Z', activeSessions: 3 };
async function setup(manager = true) {
  const profile = signal<AccountProfile | null>(null);
  const api = {
    profile,
    load: vi.fn<() => Promise<AccountProfile>>().mockImplementation(async () => { profile.set(account); return account; }),
    update: vi.fn<(name: string) => Promise<AccountProfile>>().mockImplementation(async fullName => { const updated = { ...account, fullName }; profile.set(updated); return updated; }),
    changePassword: vi.fn<(current: string, next: string) => Promise<{ revokedSessions: number }>>().mockResolvedValue({ revokedSessions: 2 }),
    revokeOtherSessions: vi.fn<() => Promise<{ revokedSessions: number }>>().mockResolvedValue({ revokedSessions: 2 }),
  };
  const confirm = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const logout = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('Offline'));
  TestBed.configureTestingModule({ imports: [ProfilePage], providers: [provideRouter([]), { provide: AccountApiService, useValue: api }, { provide: AuthApiService, useValue: { isManager: () => manager, logout } }, { provide: DsConfirmService, useValue: { confirm } }] });
  const fixture = TestBed.createComponent(ProfilePage); fixture.detectChanges(); await fixture.whenStable();
  await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false)); fixture.detectChanges();
  return { page: fixture.componentInstance, fixture, api, confirm, logout };
}
afterEach(() => TestBed.resetTestingModule());

describe('Profile forms and sessions', () => {
  it('prevents duplicate password changes and retains fields after a failed update', async () => {
    const { page, fixture, api } = await setup(); page.passwordForm.patchValue({ currentPassword: 'x'.repeat(12), newPassword: 'y'.repeat(12), confirmPassword: 'y'.repeat(12) });
    let reject!: (reason: Error) => void; api.changePassword.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const saving = page.changePassword(); await page.changePassword(); fixture.detectChanges();
    expect(api.changePassword).toHaveBeenCalledTimes(1); expect(fixture.nativeElement.querySelector('#profile-newPassword').matches(':disabled')).toBe(true);
    reject(new Error('Offline')); await saving; expect(page.passwordForm.controls.newPassword.value).toHaveLength(12); expect(page.passwordNotice()?.tone).toBe('danger');
  });
  it('validates trimmed names and mismatching passwords with field feedback', async () => {
    const { page, fixture, api } = await setup(); page.nameForm.controls.fullName.setValue(' a '); await page.saveName();
    page.passwordForm.patchValue({ currentPassword: 'x'.repeat(12), newPassword: 'y'.repeat(12), confirmPassword: 'z'.repeat(12) }); await page.changePassword(); fixture.detectChanges();
    expect(api.update).not.toHaveBeenCalled(); expect(api.changePassword).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#profile-fullName').getAttribute('aria-invalid')).toBe('true');
    expect(fixture.nativeElement.querySelector('#profile-confirmPassword-error').textContent).toContain('no coinciden');
  });
  it('locks concurrent operations and preserves the name after a failed save', async () => {
    const { page, fixture, api, confirm } = await setup(); page.nameForm.controls.fullName.setValue('Nuevo nombre');
    let reject!: (reason: Error) => void; api.update.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const saving = page.saveName(); fixture.detectChanges(); await page.saveName(); await page.revokeOtherSessions(); page.discardName();
    expect(api.update).toHaveBeenCalledTimes(1); expect(confirm).not.toHaveBeenCalled(); expect(fixture.nativeElement.querySelector('#profile-fullName').matches(':disabled')).toBe(true);
    reject(new Error('Offline')); await saving; expect(page.nameForm.controls.fullName.value).toBe('Nuevo nombre'); expect(page.hasNameChanges()).toBe(true);
    await page.saveName(); expect(page.hasNameChanges()).toBe(false); expect(page.profile()?.fullName).toBe('Nuevo nombre');
  });
  it('discards the name locally without changing the password draft', async () => {
    const { page, api } = await setup(); page.nameForm.controls.fullName.setValue('Borrador'); page.passwordForm.controls.newPassword.setValue('x'.repeat(12));
    page.discardName(); expect(page.nameForm.controls.fullName.value).toBe(account.fullName); expect(page.passwordForm.controls.newPassword.value).toHaveLength(12); expect(api.update).not.toHaveBeenCalled();
  });
  it('keeps password success when refreshing sessions fails and clears secret fields', async () => {
    const { page, api } = await setup(); page.nameForm.controls.fullName.setValue('Borrador de nombre');
    page.passwordForm.patchValue({ currentPassword: 'x'.repeat(12), newPassword: 'y'.repeat(12), confirmPassword: 'y'.repeat(12) }); page.toggle('next');
    api.load.mockRejectedValueOnce(new Error('Offline')); await page.changePassword();
    expect(page.passwordNotice()?.tone).toBe('success'); expect(page.sessionsStale()).toBe(true); expect(page.passwordForm.controls.newPassword.value).toBe(''); expect(page.visible().next).toBe(false);
    expect(page.nameForm.controls.fullName.value).toBe('Borrador de nombre'); await page.refreshSessions(); expect(page.sessionsStale()).toBe(false);
  });
  it('rechecks busy state after confirmation and preserves session state on failure', async () => {
    const { page, api, confirm } = await setup(); let approve!: (value: boolean) => void;
    confirm.mockImplementationOnce(() => new Promise(resolve => { approve = resolve; })); const pending = page.revokeOtherSessions(); page.savingName.set(true); approve(true); await pending;
    expect(api.revokeOtherSessions).not.toHaveBeenCalled(); page.savingName.set(false);
    api.revokeOtherSessions.mockRejectedValueOnce(new Error('Offline')); await page.revokeOtherSessions(); expect(page.otherSessions()).toBe(2); expect(page.sessionNotice()?.tone).toBe('danger'); expect(page.revoking()).toBe(false);
  });
  it('exposes cached-profile load failure, blocks edits and recovers on retry', async () => {
    const { page, fixture, api } = await setup(); api.load.mockRejectedValueOnce(new Error('Offline')); await page.load(); page.nameForm.controls.fullName.setValue('Borrador'); await page.saveName(); fixture.detectChanges();
    expect(page.loadError()).toBe(true); expect(api.update).not.toHaveBeenCalled(); expect(fixture.nativeElement.textContent).toContain('Reintenta antes de editar');
    await page.load(); expect(page.loadError()).toBe(false);
  });
  it('preserves manager-only navigation and makes failed logout recoverable', async () => {
    const { page, fixture } = await setup(false); expect(fixture.nativeElement.querySelector('a[href="/app/team"]')).toBeNull();
    await page.logout(); expect(page.loggingOut()).toBe(false); expect(page.sessionNotice()?.tone).toBe('danger');
  });
});
