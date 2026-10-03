import type { Storefront } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * The tenant's storefront row, created on first use. It also holds the shipping settings,
 * which the sales agent uses whether or not the store add-on is active.
 */
export async function ensureStorefront(prisma: PrismaService, tenantId: string): Promise<Storefront> {
  const existing = await prisma.storefront.findUnique({ where: { tenantId } });
  if (existing) {
    return existing;
  }
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { name: true },
  });
  return prisma.storefront.upsert({
    where: { tenantId },
    create: { tenantId, displayName: tenant.name },
    update: {},
  });
}
