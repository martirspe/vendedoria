import { createHmac, timingSafeEqual } from 'node:crypto';

export const RECOVERY_CONSENT_VERSION = 'recovery-2026-10-05';
export const RECOVERY_TTL_MS = 7 * 86400_000;

export function recoveryToken(
  secret: string,
  tenantId: string,
  id: string,
  expiresAt: Date,
): string {
  const body = `${id}.${expiresAt.getTime()}`;
  const signature = createHmac('sha256', secret)
    .update(`cart-recovery-v1/${tenantId}/${body}`)
    .digest('base64url');
  return `${body}.${signature}`;
}

export function recoveryId(
  secret: string,
  tenantId: string,
  token: string,
  now = Date.now(),
): string | null {
  const match = /^([a-z0-9]{20,40})\.(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(
    token,
  );
  if (!match || Number(match[2]) <= now) return null;
  const expected = recoveryToken(
    secret,
    tenantId,
    match[1],
    new Date(Number(match[2])),
  );
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token))
    ? match[1]
    : null;
}

export function sessionHash(
  secret: string,
  tenantId: string,
  sessionId: string,
): string {
  return createHmac('sha256', secret)
    .update(`store-behavior-v1/${tenantId}/${sessionId}`)
    .digest('hex');
}
