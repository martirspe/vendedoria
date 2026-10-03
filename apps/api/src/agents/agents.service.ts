import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SalesAgent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import {
  buildAgentPrompt,
  buildGuidedPersona,
  toPersonality,
} from '../agent-runtime/sales-playbook';
import { computeAgentQuality } from './agent-quality';
import {
  CreateSalesAgentDto,
  UpdateSalesAgentDto,
} from './dto/update-sales-agent.dto';

export const MAX_AGENTS_PER_TENANT = 10;

type AgentWithChannels = SalesAgent & { channels: Array<{ id: string }> };

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledge: KnowledgeService,
  ) {}

  async list(tenantId: string) {
    const agents = await this.prisma.salesAgent.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        isActive: true,
        promptMode: true,
        channels: { select: { id: true } },
      },
    });
    return agents.map((agent, index) => ({
      id: agent.id,
      name: agent.name,
      isActive: agent.isActive,
      promptMode: agent.promptMode,
      isPrimary: index === 0,
      channelIds: agent.channels.map((channel) => channel.id),
    }));
  }

  async getPrimary(tenantId: string) {
    return this.toResponse(tenantId, await this.findPrimary(tenantId));
  }

  async updatePrimary(tenantId: string, dto: UpdateSalesAgentDto) {
    const agent = await this.findPrimary(tenantId);
    return this.update(tenantId, agent.id, dto);
  }

  async get(tenantId: string, id: string) {
    return this.toResponse(tenantId, await this.findOwned(tenantId, id));
  }

  async create(tenantId: string, dto: CreateSalesAgentDto) {
    const count = await this.prisma.salesAgent.count({ where: { tenantId } });
    if (count >= MAX_AGENTS_PER_TENANT) {
      throw new BadRequestException(
        `Puedes tener hasta ${MAX_AGENTS_PER_TENANT} vendedores.`,
      );
    }
    const source = dto.copyFromId
      ? await this.findOwned(tenantId, dto.copyFromId)
      : await this.findPrimary(tenantId).catch(() => null);
    const created = await this.prisma.salesAgent.create({
      data: dto.copyFromId && source
        ? { ...this.copyableFields(source), tenantId, name: dto.name.trim() }
        : {
            tenantId,
            name: dto.name.trim(),
            companyName: source?.companyName,
            companyDescription: source?.companyDescription,
          },
      include: { channels: { select: { id: true } } },
    });
    return this.toResponse(tenantId, created);
  }

  async update(tenantId: string, id: string, dto: UpdateSalesAgentDto) {
    await this.findOwned(tenantId, id);
    const updated = await this.prisma.salesAgent.update({
      where: { id },
      data: dto,
      include: { channels: { select: { id: true } } },
    });
    return this.toResponse(tenantId, updated);
  }

  async remove(tenantId: string, id: string) {
    const [agent, primary] = await Promise.all([
      this.findOwned(tenantId, id),
      this.findPrimary(tenantId),
    ]);
    if (agent.id === primary.id) {
      throw new BadRequestException(
        'El vendedor principal no se puede eliminar.',
      );
    }
    await this.prisma.salesAgent.delete({ where: { id: agent.id } });
    return { deleted: true };
  }

  /** The agent answers exactly these channels; channels it leaves go back to the primary agent. */
  async assignChannels(tenantId: string, id: string, channelIds: string[]) {
    const agent = await this.findOwned(tenantId, id);
    const unique = [...new Set(channelIds)];
    const owned = await this.prisma.channel.count({
      where: { tenantId, id: { in: unique } },
    });
    if (owned !== unique.length) {
      throw new NotFoundException('Channel not found');
    }
    await this.prisma.$transaction([
      this.prisma.channel.updateMany({
        where: { tenantId, salesAgentId: agent.id, id: { notIn: unique } },
        data: { salesAgentId: null },
      }),
      this.prisma.channel.updateMany({
        where: { tenantId, id: { in: unique } },
        data: { salesAgentId: agent.id },
      }),
    ]);
    return this.get(tenantId, agent.id);
  }

  /** Compiled prompt so advanced users can audit it or start a custom prompt from it. */
  async promptPreview(tenantId: string, id: string) {
    const personality = toPersonality(await this.findOwned(tenantId, id));
    return {
      guidedPersona: buildGuidedPersona(personality),
      effectivePrompt: buildAgentPrompt(personality),
    };
  }

  private async findPrimary(tenantId: string): Promise<AgentWithChannels> {
    const agent = await this.prisma.salesAgent.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      include: { channels: { select: { id: true } } },
    });
    if (!agent) {
      throw new NotFoundException('Sales agent not found');
    }
    return agent;
  }

  private async findOwned(tenantId: string, id: string): Promise<AgentWithChannels> {
    const agent = await this.prisma.salesAgent.findFirst({
      where: { id, tenantId },
      include: { channels: { select: { id: true } } },
    });
    if (!agent) {
      throw new NotFoundException('Sales agent not found');
    }
    return agent;
  }

  private copyableFields(source: AgentWithChannels) {
    const {
      id: _id,
      tenantId: _tenantId,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      channels: _channels,
      ...fields
    } = source;
    return fields;
  }

  private async toResponse(tenantId: string, agent: AgentWithChannels) {
    const [extras, primary] = await Promise.all([
      this.knowledge.getQualityExtras(tenantId),
      this.prisma.salesAgent.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      }),
    ]);
    const { channels, ...fields } = agent;
    return {
      ...fields,
      isPrimary: primary?.id === agent.id,
      channelIds: channels.map((channel) => channel.id),
      quality: computeAgentQuality(agent, extras),
    };
  }
}
