import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computeAgentQuality } from './agent-quality';
import { UpdateSalesAgentDto } from './dto/update-sales-agent.dto';

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPrimary(tenantId: string) {
    const agent = await this.prisma.salesAgent.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
    if (!agent) {
      throw new NotFoundException('Sales agent not found');
    }
    return this.toResponse(agent);
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
    return this.toResponse(updated);
  }

  private toResponse<T extends object>(agent: T) {
    return {
      ...agent,
      quality: computeAgentQuality(agent as Parameters<typeof computeAgentQuality>[0]),
    };
  }
}
