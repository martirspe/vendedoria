import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalesAgentRuntimeService } from '../agent-runtime/sales-agent-runtime.service';

@Injectable()
export class PlaygroundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRuntime: SalesAgentRuntimeService,
  ) {}

  async createSession(tenantId: string, title?: string) {
    return this.prisma.playgroundSession.create({
      data: {
        tenantId,
        title: title?.trim() || 'Prueba del vendedor',
      },
      include: { messages: true },
    });
  }

  async getLatestOrCreate(tenantId: string) {
    const existing = await this.prisma.playgroundSession.findFirst({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 100 },
      },
    });
    if (existing) {
      return existing;
    }
    return this.createSession(tenantId);
  }

  async getSession(tenantId: string, sessionId: string) {
    const session = await this.prisma.playgroundSession.findFirst({
      where: { id: sessionId, tenantId },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 200 },
      },
    });
    if (!session) {
      throw new NotFoundException('Playground session not found');
    }
    return session;
  }

  async resetSession(tenantId: string, sessionId: string) {
    const session = await this.ensureOwnership(tenantId, sessionId);
    await this.prisma.playgroundMessage.deleteMany({
      where: { sessionId: session.id },
    });
    return this.getSession(tenantId, session.id);
  }

  async sendMessage(tenantId: string, sessionId: string, text: string) {
    const session = await this.ensureOwnership(tenantId, sessionId);
    const trimmed = text.trim();

    await this.prisma.playgroundMessage.create({
      data: {
        sessionId: session.id,
        direction: 'INBOUND',
        authorType: 'BUYER',
        body: trimmed,
      },
    });

    const agentResult = await this.agentRuntime.generateReply({
      tenantId,
      conversationId: null,
      inboundText: trimmed,
      mode: 'playground',
      customerName: 'Comprador de prueba',
      customerPhone: null,
    });

    await this.prisma.playgroundMessage.create({
      data: {
        sessionId: session.id,
        direction: 'OUTBOUND',
        authorType: 'SALES_AGENT',
        body: agentResult.replyText,
        toolTraces: agentResult.tools as unknown as Prisma.InputJsonValue,
      },
    });

    await this.prisma.playgroundSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    });

    const refreshed = await this.getSession(tenantId, session.id);
    return {
      session: refreshed,
      lastAgentReply: {
        replyText: agentResult.replyText,
        escalate: agentResult.escalate,
        usedCatalog: agentResult.usedCatalog,
        tools: agentResult.tools,
        orderId: agentResult.orderId,
        checkoutUrl: agentResult.checkoutUrl,
        dryRun: true,
      },
    };
  }

  private async ensureOwnership(tenantId: string, sessionId: string) {
    const session = await this.prisma.playgroundSession.findFirst({
      where: { id: sessionId, tenantId },
    });
    if (!session) {
      throw new NotFoundException('Playground session not found');
    }
    return session;
  }
}
