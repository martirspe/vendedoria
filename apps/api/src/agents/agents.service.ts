import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { computeAgentQuality } from './agent-quality';
import { UpdateSalesAgentDto } from './dto/update-sales-agent.dto';

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledge: KnowledgeService,
  ) {}

  async getPrimary(tenantId: string) {
    const agent = await this.prisma.salesAgent.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
    if (!agent) {
      throw new NotFoundException('Sales agent not found');
    }
    return this.toResponse(tenantId, agent);
  }

  async updatePrimary(tenantId: string, dto: UpdateSalesAgentDto) {
    const agent = await this.prisma.salesAgent.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
    if (!agent) {
      throw new NotFoundException('Sales agent not found');
    }

    const updated = await this.prisma.salesAgent.update({
      where: { id: agent.id },
      data: dto,
    });
    return this.toResponse(tenantId, updated);
  }

  private async toResponse<T extends object>(tenantId: string, agent: T) {
    const extras = await this.knowledge.getQualityExtras(tenantId);
    return {
      ...agent,
      quality: computeAgentQuality(
        agent as Parameters<typeof computeAgentQuality>[0],
        extras,
      ),
    };
  }
}
