import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Channel, ChannelType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelMessengerService } from '../channels/channel-messenger.service';
import { isIntegrationActive } from '../integrations/integration-state';
import { buildAgentContext, HISTORY_LIMIT } from '../agent-runtime/conversation-context';
import { SalesAgentRuntimeService } from '../agent-runtime/sales-agent-runtime.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { MediaService } from '../catalog/media.service';
import { MetaWhatsAppClient } from '../channels/meta-whatsapp.client';
import { asWhatsAppMetadata } from '../channels/whatsapp-metadata';
import { OrderEmailService } from '../checkout/order-email.service';
import { InboxEventsService } from './inbox-events.service';
import { SalesGatewayService } from './sales-gateway.service';
import {
  findMessageTemplate,
  MESSAGE_TEMPLATES,
  renderTemplateBody,
} from './message-templates';

const WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRuntime: SalesAgentRuntimeService,
    private readonly metaWhatsApp: MetaWhatsAppClient,
    private readonly messenger: ChannelMessengerService,
    private readonly planLimits: PlanLimitsService,
    private readonly media: MediaService,
    private readonly inboxEvents: InboxEventsService,
    private readonly emails: OrderEmailService,
    private readonly salesGateway: SalesGatewayService,
  ) {}

  list(
    tenantId: string,
    filters?: {
      channelType?: ChannelType;
      unattended?: boolean;
      salesOnly?: boolean;
      q?: string;
    },
  ) {
    const where: Prisma.ConversationWhereInput = {
      tenantId,
      ...(filters?.unattended ? { markedUnattended: true } : {}),
      ...(filters?.salesOnly ? { markedAsSale: true } : {}),
      ...(filters?.channelType
        ? { channel: { type: filters.channelType } }
        : {}),
      ...(filters?.q
        ? {
            OR: [
              { contactName: { contains: filters.q, mode: 'insensitive' } },
              { contactPhone: { contains: filters.q } },
            ],
          }
        : {}),
    };

    return this.prisma.conversation.findMany({
      where,
      include: {
        channel: {
          select: {
            id: true,
            type: true,
            healthStatus: true,
            displayName: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 100,
    });
  }

  async getById(tenantId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      include: {
        channel: true,
        messages: { orderBy: { createdAt: 'asc' }, take: 200 },
      },
    });
    if (!conversation) {
      throw new NotFoundException('Conversación no encontrada.');
    }

    const linkedOrder = await this.prisma.order.findFirst({
      where: { tenantId, conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      include: {
        items: { take: 3 },
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    return {
      ...conversation,
      messagingWindow: conversation.channel.type === 'TIKTOK_LIVE'
        ? { canSendFreeForm: false, closesAt: null, reason: 'TikTok LIVE requiere revisión y envío manual desde su panel.' }
        : this.getMessagingWindow(conversation.lastInboundAt),
      linkedOrder: linkedOrder
        ? {
            id: linkedOrder.id,
            status: linkedOrder.status,
            totalCents: linkedOrder.totalCents,
            currency: linkedOrder.currency,
            itemCount: linkedOrder.items.length,
            paymentStatus: linkedOrder.payments[0]?.status ?? null,
            checkoutUrl: linkedOrder.payments[0]?.checkoutUrl ?? null,
            updatedAt: linkedOrder.updatedAt,
          }
        : null,
    };
  }

  async updateFlags(
    tenantId: string,
    conversationId: string,
    data: {
      agentEnabled?: boolean;
      markedAsSale?: boolean;
      markedUnattended?: boolean;
      status?: 'OPEN' | 'PAUSED' | 'CLOSED';
    },
  ) {
    await this.ensureOwnership(tenantId, conversationId);
    if (data.agentEnabled) {
      const conversation = await this.prisma.conversation.findFirst({ where: { id: conversationId, tenantId }, select: { channel: { select: { type: true } } } });
      if (conversation?.channel.type === 'TIKTOK_LIVE') throw new BadRequestException('TikTok LIVE no permite activar respuestas automáticas. Usa su panel para revisar las sugerencias.');
    }
    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        agentEnabled: data.agentEnabled,
        markedAsSale: data.markedAsSale,
        markedUnattended: data.markedUnattended,
        status: data.status,
      },
    });
    this.inboxEvents.publish(tenantId, conversationId, 'conversation');
    return updated;
  }

  async sendOperatorMessage(
    tenantId: string,
    conversationId: string,
    text: string,
  ) {
    const conversation = await this.getById(tenantId, conversationId);
    if (conversation.channel.type === 'TIKTOK_LIVE') {
      throw new ForbiddenException('Las respuestas LIVE se revisan y copian desde el panel TikTok LIVE. Tu conexión no permite enviarlas automáticamente.');
    }
    const window = this.getMessagingWindow(conversation.lastInboundAt);

    if (!window.canSendFreeForm) {
      throw new ForbiddenException(
        'No puedes responder: el cliente no escribió en las últimas 24 horas. Usa una plantilla Meta aprobada.',
      );
    }

    // Pause before network I/O: an in-flight engine turn checks this before commerce and sending.
    await this.prisma.conversation.updateMany({ where: { id: conversationId, tenantId }, data: { agentEnabled: false, status: 'PAUSED' } });
    const recipient = this.messenger.recipientOf(conversation.channel, conversation);
    const send = recipient ? await this.messenger.sendText(conversation.channel, recipient, text) : null;
    if (send && !send.ok) {
      this.logger.warn(`Operator outbound failed: ${send.error}`);
    }
    const externalId = send?.messageId;

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          direction: 'OUTBOUND',
          authorType: 'HUMAN_OPERATOR',
          body: text,
          externalId,
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          agentEnabled: false,
          status: 'PAUSED',
          markedUnattended: false,
        },
      }),
    ]);
    this.inboxEvents.publish(tenantId, conversationId);

    return {
      message,
      agentEnabled: false,
      notice:
        'El vendedor IA se pausó en esta conversación porque respondiste como humano.',
    };
  }

  listTemplates() {
    return MESSAGE_TEMPLATES;
  }

  async sendOperatorTemplate(
    tenantId: string,
    conversationId: string,
    templateId: string,
    variables: string[] = [],
  ) {
    const conversation = await this.getById(tenantId, conversationId);
    const template = findMessageTemplate(templateId);
    if (conversation.channel.type === 'TIKTOK_LIVE') throw new BadRequestException('Las plantillas de Meta no se envían a TikTok LIVE. Usa su panel para revisar las sugerencias.');
    if (!template) {
      throw new BadRequestException('Unknown message template');
    }

    const rendered = renderTemplateBody(
      template,
      variables.length
        ? variables
        : [conversation.contactName || 'cliente'],
    );

    const metadata = asWhatsAppMetadata(conversation.channel.metadata);
    let externalId: string | undefined;
    let dryRun = false;
    await this.prisma.conversation.updateMany({ where: { id: conversationId, tenantId }, data: { agentEnabled: false, status: 'PAUSED' } });

    if (
      conversation.channel.type === 'WHATSAPP' &&
      metadata &&
      conversation.contactPhone
    ) {
      const send = await this.metaWhatsApp.sendTemplateMessage({
        phoneNumberId: metadata.phoneNumberId,
        accessToken: metadata.accessToken,
        toPhone: conversation.contactPhone,
        templateName: template.name,
        languageCode: template.language,
        bodyParameters: variables.length
          ? variables
          : [conversation.contactName || 'cliente'],
      });
      if (!send.ok) {
        this.logger.warn(`Template outbound failed: ${send.error}`);
        throw new BadRequestException(
          send.error || 'No se pudo enviar la plantilla por Meta',
        );
      }
      externalId = send.messageId;
      dryRun = Boolean(send.dryRun);
    }

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          direction: 'OUTBOUND',
          authorType: 'HUMAN_OPERATOR',
          body: rendered,
          externalId,
          metadata: {
            templateId: template.id,
            templateName: template.name,
            dryRun,
          } as Prisma.InputJsonValue,
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          agentEnabled: false,
          status: 'PAUSED',
          markedUnattended: false,
        },
      }),
    ]);
    this.inboxEvents.publish(tenantId, conversationId);

    return {
      message,
      agentEnabled: false,
      dryRun,
      notice: dryRun
        ? 'Plantilla registrada en local (token placeholder · sin Graph API). El agente quedó pausado.'
        : 'Plantilla enviada. El vendedor IA se pausó en esta conversación.',
    };
  }

  async ingestInboundWhatsApp(params: {
    phoneNumberId: string;
    fromPhone: string;
    contactName?: string;
    text: string;
    externalMessageId?: string;
  }) {
    const channel = await this.prisma.channel.findFirst({
      where: {
        type: 'WHATSAPP',
        externalId: params.phoneNumberId,
      },
    });

    if (!channel) {
      this.logger.warn(
        `No WhatsApp channel for phoneNumberId=${params.phoneNumberId}`,
      );
      return { ignored: true };
    }

    return this.ingestInbound(channel, {
      threadId: params.fromPhone,
      contactPhone: params.fromPhone,
      contactName: params.contactName,
      text: params.text,
      externalMessageId: params.externalMessageId,
    });
  }

  async ingestInboundInstagram(params: {
    accountId: string;
    senderId: string;
    text: string;
    externalMessageId?: string;
  }) {
    const channel = await this.prisma.channel.findFirst({
      where: { type: 'INSTAGRAM', externalId: params.accountId },
    });
    if (!channel || !(await isIntegrationActive(this.prisma, channel.tenantId, 'instagram'))) {
      this.logger.warn(`No active Instagram channel for accountId=${params.accountId}`);
      return { ignored: true };
    }

    return this.ingestInbound(channel, {
      threadId: params.senderId,
      contactPhone: null,
      text: params.text,
      externalMessageId: params.externalMessageId,
    });
  }

  private async ingestInbound(
    channel: Channel,
    params: {
      threadId: string;
      contactPhone: string | null;
      contactName?: string;
      text: string;
      externalMessageId?: string;
    },
  ) {
    const now = new Date();
    if (params.externalMessageId && await this.salesGateway.isDuplicate(channel.tenantId, channel.id, params.externalMessageId)) return { duplicate: true };
    if (params.externalMessageId) {
      const duplicate = await this.prisma.message.findFirst({ where: { externalId: params.externalMessageId, direction: 'INBOUND', conversation: { tenantId: channel.tenantId, channelId: channel.id } }, select: { id: true } });
      if (duplicate) return { duplicate: true };
    }
    const existingConversation = await this.prisma.conversation.findUnique({
      where: {
        channelId_externalThreadId: {
          channelId: channel.id,
          externalThreadId: params.threadId,
        },
      },
    });

    if (!existingConversation) {
      await this.planLimits.assertCanStartConversation(channel.tenantId);
    }

    const captured = await this.prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.upsert({
      where: {
        channelId_externalThreadId: {
          channelId: channel.id,
          externalThreadId: params.threadId,
        },
      },
      create: {
        tenantId: channel.tenantId,
        channelId: channel.id,
        externalThreadId: params.threadId,
        contactPhone: params.contactPhone,
        contactName: params.contactName,
        lastInboundAt: now,
        status: 'OPEN',
        agentEnabled: true,
      },
      update: {
        contactName: params.contactName ?? undefined,
        lastInboundAt: now,
        status: 'OPEN',
        updatedAt: now,
      },
    });

    const inbound = await tx.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'INBOUND',
        authorType: 'BUYER',
        body: params.text,
        externalId: params.externalMessageId,
        inboundKey: params.externalMessageId ? `${channel.tenantId}/${channel.id}/${params.externalMessageId}` : undefined,
        enginePending: this.salesGateway.enabled,
      },
    });
    return { conversation, inbound };
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
      throw error;
    });
    if (!captured) return { duplicate: true };
    const { conversation, inbound } = captured;
    if (params.externalMessageId) await this.salesGateway.rememberInbound(channel.tenantId, channel.id, params.externalMessageId);
    const tenantId = channel.tenantId;
    this.inboxEvents.publish(tenantId, conversation.id);

    await this.prisma.channel.update({
      where: { id: channel.id },
      data: { lastActiveAt: now, healthStatus: 'CONNECTED' },
    });

    if (this.salesGateway.enabled) {
      await this.salesGateway.buffered(tenantId, conversation.id, inbound.id);
      return { conversationId: conversation.id, buffered: true };
    }

    if (!conversation.agentEnabled) {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { markedUnattended: true },
      });
      this.inboxEvents.publish(tenantId, conversation.id, 'conversation');
      return { conversationId: conversation.id, agentSkipped: true };
    }

    const earlier = await this.prisma.message.findMany({
      where: { conversationId: conversation.id, id: { not: inbound.id } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT * 2,
      select: { authorType: true, body: true, metadata: true },
    });
    const context = buildAgentContext(earlier.reverse());

    const agentResult = await this.agentRuntime.generateReply({
      tenantId,
      channelId: channel.id,
      conversationId: conversation.id,
      inboundText: params.text,
      mode: 'production',
      customerName: conversation.contactName,
      customerPhone: conversation.contactPhone ?? params.contactPhone,
      history: context.history,
      shownImageProductIds: context.shownImageProductIds,
      allowAi: await this.planLimits.canUseAi(tenantId),
    });
    if (agentResult.usedAi) {
      await this.planLimits.recordAiReply(tenantId);
    }

    const send = agentResult.checkoutUrl
      ? await this.messenger.sendPaymentLink(channel, params.threadId, {
          text: agentResult.replyText,
          url: agentResult.checkoutUrl,
          footer: agentResult.orderRef ? `Pedido ${agentResult.orderRef}` : undefined,
        })
      : await this.messenger.sendText(channel, params.threadId, agentResult.replyText);
    const outboundExternalId = send?.messageId;
    if (send && !send.ok) {
      this.logger.warn(`Agent ${channel.type} send failed: ${send.error}`);
    }
    const metadata = channel.type === 'WHATSAPP' ? asWhatsAppMetadata(channel.metadata) : null;

    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        authorType: 'SALES_AGENT',
        body: agentResult.replyText,
        externalId: outboundExternalId,
        metadata: {
          tools: agentResult.tools,
          usedCatalog: agentResult.usedCatalog,
          escalate: agentResult.escalate,
          orderId: agentResult.orderId ?? null,
          checkoutUrl: agentResult.checkoutUrl ?? null,
        } as Prisma.InputJsonValue,
      },
    });
    this.inboxEvents.publish(tenantId, conversation.id);

    for (const image of channel.type === 'WHATSAPP' ? agentResult.images : []) {
      let imageExternalId: string | undefined;
      if (metadata) {
        const send = await this.metaWhatsApp.sendImageMessage({
          phoneNumberId: metadata.phoneNumberId,
          accessToken: metadata.accessToken,
          toPhone: params.threadId,
          caption: image.caption,
          cacheKey: image.imageUrl,
          loadJpeg: () => this.media.jpegForMessaging(image.imageUrl),
        });
        if (!send.ok) {
          this.logger.warn(`Agent WhatsApp image failed: ${send.error}`);
          continue;
        }
        imageExternalId = send.messageId;
      }
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'OUTBOUND',
          authorType: 'SALES_AGENT',
          body: image.caption,
          externalId: imageExternalId,
          metadata: {
            kind: 'image',
            imageUrl: image.imageUrl,
            productId: image.productId,
          } as Prisma.InputJsonValue,
        },
      });
      this.inboxEvents.publish(tenantId, conversation.id);
    }

    if (agentResult.escalate) {
      const newlyUnattended = await this.prisma.conversation.updateMany({
        where: { id: conversation.id, tenantId, markedUnattended: false },
        data: { markedUnattended: true },
      });
      if (agentResult.pauseOnHandoff) {
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: { agentEnabled: false, status: 'PAUSED' },
        });
      }
      this.inboxEvents.publish(tenantId, conversation.id, 'conversation');
      if (newlyUnattended.count) {
        // Not awaited: an email provider outage must not delay or fail the channel webhook.
        void this.emails
          .sendHandoffAlert(tenantId, conversation.id, agentResult.pauseOnHandoff)
          .catch((error: unknown) =>
            this.logger.warn(`Handoff alert failed: ${error instanceof Error ? error.name : 'unknown error'}`),
          );
      }
    }

    return {
      conversationId: conversation.id,
      escalate: agentResult.escalate,
      usedCatalog: agentResult.usedCatalog,
    };
  }

  isWithinMessagingWindow(lastInboundAt: Date | null | undefined): boolean {
    return this.getMessagingWindow(lastInboundAt).canSendFreeForm;
  }

  private getMessagingWindow(lastInboundAt: Date | null | undefined) {
    if (!lastInboundAt) {
      return {
        canSendFreeForm: false,
        closesAt: null as string | null,
        reason: 'Sin mensaje entrante reciente del cliente.',
      };
    }
    const closesAt = new Date(lastInboundAt.getTime() + WINDOW_MS);
    const canSendFreeForm = closesAt.getTime() > Date.now();
    return {
      canSendFreeForm,
      closesAt: closesAt.toISOString(),
      reason: canSendFreeForm
        ? null
        : 'Ventana de 24h de Meta cerrada. Usa una plantilla aprobada.',
    };
  }

  private async ensureOwnership(tenantId: string, conversationId: string) {
    const found = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException('Conversación no encontrada.');
    }
  }
}
