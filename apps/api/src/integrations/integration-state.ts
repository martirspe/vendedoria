import type { PrismaService } from '../prisma/prisma.service';
import { IntegrationKey, planAllows, resolvePlanState } from '../billing/plan-catalog';

export const INTEGRATION_KEYS: IntegrationKey[] = ['store', 'custom_domain', 'instagram', 'tracking', 'team', 'tiktok_live'];

/**
 * Integrations that work on top of another one. Each keeps its own switch and settings: while the
 * required one is off it is paused, and it resumes by itself when that one is turned on again.
 */
export const INTEGRATION_REQUIRES: Partial<Record<IntegrationKey, IntegrationKey>> = {
  custom_domain: 'store',
  tracking: 'store',
  tiktok_live: 'store',
};

export function isIntegrationKey(value: string): value is IntegrationKey {
  return (INTEGRATION_KEYS as string[]).includes(value);
}

/** The key plus the integration it works on, if any. */
function chainOf(key: IntegrationKey): IntegrationKey[] {
  const required = INTEGRATION_REQUIRES[key];
  return required ? [key, required] : [key];
}

/** On, included in the current plan (expired plans include none) and not paused by a requirement. */
export function resolveActive(
  key: IntegrationKey,
  enabledKeys: ReadonlySet<string>,
  allowed: (key: IntegrationKey) => boolean,
): boolean {
  return chainOf(key).every((item) => enabledKeys.has(item) && allowed(item));
}

export async function isIntegrationActive(
  prisma: PrismaService,
  tenantId: string,
  key: IntegrationKey,
): Promise<boolean> {
  const [records, tenant] = await Promise.all([
    prisma.tenantIntegration.findMany({
      where: { tenantId, key: { in: chainOf(key) }, enabled: true },
      select: { key: true },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { planTier: true, planTrial: true, planExpiresAt: true },
    }),
  ]);
  if (!tenant) return false;
  const state = resolvePlanState(tenant);
  return resolveActive(key, new Set(records.map((record) => record.key)), (item) => planAllows(state, item));
}

/** Verified own domain the store is served on, or null when it falls back to the subdomain. */
export async function activeCustomDomain(prisma: PrismaService, tenantId: string): Promise<string | null> {
  const storefront = await prisma.storefront.findUnique({
    where: { tenantId },
    select: { customDomain: true, customDomainStatus: true },
  });
  if (!storefront?.customDomain || storefront.customDomainStatus !== 'active') return null;
  return (await isIntegrationActive(prisma, tenantId, 'custom_domain')) ? storefront.customDomain : null;
}
