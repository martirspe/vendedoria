import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PlatformAuditEntry = {
  actorUserId: string | null;
  action: string;
  targetUserId?: string;
  targetTenantId?: string;
  /** Ids, roles and counters only: never emails, phones or chat content. */
  metadata?: Prisma.InputJsonObject;
};

@Injectable()
export class PlatformAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: PlatformAuditEntry): Promise<void> {
    await this.prisma.platformAuditLog.create({ data: entry });
  }
}
