import { recoveryId, recoveryToken, sessionHash } from './recovery-token';

describe('Recovery capability', () => {
  const secret = 'test-secret'.repeat(4);
  const id = 'cm00000000000000000000000';
  const expiry = new Date(Date.now() + 60_000);
  it('binds capabilities and anonymous session hashes to the tenant', () => {
    const token = recoveryToken(secret, 'tenant-a', id, expiry);
    expect(recoveryId(secret, 'tenant-a', token)).toBe(id);
    expect(recoveryId(secret, 'tenant-b', token)).toBeNull();
    expect(sessionHash(secret, 'tenant-a', 'session')).not.toBe(
      sessionHash(secret, 'tenant-b', 'session'),
    );
  });
  it('rejects expired, tampered and malformed capabilities without throwing', () => {
    const token = recoveryToken(secret, 'tenant-a', id, expiry);
    expect(recoveryId(secret, 'tenant-a', token, expiry.getTime())).toBeNull();
    for (const invalid of [
      token.replace(id, 'cm11111111111111111111111'),
      token.slice(0, -1),
      token + '/',
      'invalid',
      '💥'.repeat(100),
    ])
      expect(recoveryId(secret, 'tenant-a', invalid)).toBeNull();
  });
});
