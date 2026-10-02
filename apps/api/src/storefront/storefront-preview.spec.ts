import {
  PREVIEW_TTL_SECONDS,
  createPreviewToken,
  verifyPreviewToken,
} from './storefront-preview';

const SECRET = 'test-secret-with-enough-length-1234567890';
const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);

describe('storefront preview tokens', () => {
  it('accepts a fresh token for the same tenant', () => {
    const { token } = createPreviewToken(SECRET, 'tenant-a', NOW);
    expect(verifyPreviewToken(SECRET, 'tenant-a', token, NOW + 1000)).toBe(true);
  });

  it('rejects the token for another tenant', () => {
    const { token } = createPreviewToken(SECRET, 'tenant-a', NOW);
    expect(verifyPreviewToken(SECRET, 'tenant-b', token, NOW)).toBe(false);
  });

  it('rejects expired, tampered and malformed tokens', () => {
    const { token } = createPreviewToken(SECRET, 'tenant-a', NOW);
    const later = NOW + (PREVIEW_TTL_SECONDS + 1) * 1000;
    expect(verifyPreviewToken(SECRET, 'tenant-a', token, later)).toBe(false);
    expect(verifyPreviewToken('other-secret', 'tenant-a', token, NOW)).toBe(false);
    const [expiresAt, signature] = token.split('.');
    expect(
      verifyPreviewToken(SECRET, 'tenant-a', `${Number(expiresAt) + 60}.${signature}`, NOW),
    ).toBe(false);
    expect(verifyPreviewToken(SECRET, 'tenant-a', undefined, NOW)).toBe(false);
    expect(verifyPreviewToken(SECRET, 'tenant-a', 'garbage', NOW)).toBe(false);
  });
});
