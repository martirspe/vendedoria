import { createHmac, timingSafeEqual } from 'node:crypto';

export const PREVIEW_TTL_SECONDS = 60 * 60;

function sign(secret: string, tenantId: string, expiresAt: number): string {
  return createHmac('sha256', `storefront-preview:${secret}`)
    .update(`${tenantId}.${expiresAt}`)
    .digest('base64url');
}

/** Short-lived token that lets the merchant see an unpublished store. */
export function createPreviewToken(
  secret: string,
  tenantId: string,
  now = Date.now(),
): { token: string; expiresAt: Date } {
  const expiresAt = Math.floor(now / 1000) + PREVIEW_TTL_SECONDS;
  return {
    token: `${expiresAt}.${sign(secret, tenantId, expiresAt)}`,
    expiresAt: new Date(expiresAt * 1000),
  };
}

export function verifyPreviewToken(
  secret: string,
  tenantId: string,
  token: string | undefined,
  now = Date.now(),
): boolean {
  const match = /^(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token ?? '');
  if (!match) {
    return false;
  }
  const expiresAt = Number(match[1]);
  if (expiresAt * 1000 < now) {
    return false;
  }
  const expected = Buffer.from(sign(secret, tenantId, expiresAt));
  const received = Buffer.from(match[2]);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
