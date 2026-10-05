import type { StorefrontStatus } from '@prisma/client';
import { isIntegrationActive } from '../integrations/integration-state';
import type { PrismaService } from '../prisma/prisma.service';

export type StoreAvailability = { public: boolean; previewAllowed: boolean; reason: 'published' | 'draft' | 'suspended' | 'integration_inactive' };

/** Publication never expires. Plan/integration eligibility can pause access without modifying it. */
export function resolveStoreAvailability(status: StorefrontStatus, integrationActive: boolean): StoreAvailability {
  if (status === 'SUSPENDED') return { public: false, previewAllowed: false, reason: 'suspended' };
  if (!integrationActive) return { public: false, previewAllowed: false, reason: 'integration_inactive' };
  return { public: status === 'PUBLISHED', previewAllowed: true, reason: status === 'PUBLISHED' ? 'published' : 'draft' };
}

export async function storeAvailability(prisma: PrismaService, tenantId: string, status: StorefrontStatus): Promise<StoreAvailability> {
  return resolveStoreAvailability(status, await isIntegrationActive(prisma, tenantId, 'store'));
}
