import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesSearchService } from './sales-search.service';

@Injectable()
export class SalesEngineOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SalesSearchService,
  ) {}
  backfill(tenantId: string, type: 'product' | 'faq', after?: string) {
    return this.search.backfill(tenantId, type, after);
  }
  async diagnose(tenantId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { tenantId, id: conversationId },
      select: { id: true, agentEnabled: true, salesState: true },
    });
    if (!conversation)
      throw new NotFoundException('Conversación no encontrada.');
    const turns = await this.prisma.salesEngineTurn.findMany({
      where: { tenantId, conversationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        status: true,
        trace: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { conversation, turns };
  }
  async metrics(tenantId: string) {
    const since = new Date(Date.now() - 7 * 86400000);
    const [outcomes, failedIndexJobs, pendingMessages] = await Promise.all([
      this.prisma.salesEngineTurn.groupBy({
        by: ['status'],
        where: { tenantId, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.salesSearchJob.count({
        where: { tenantId, attempts: { gte: 5 } },
      }),
      this.prisma.message.count({
        where: { enginePending: true, conversation: { tenantId } },
      }),
    ]);
    return { since, outcomes, failedIndexJobs, pendingMessages };
  }
}
