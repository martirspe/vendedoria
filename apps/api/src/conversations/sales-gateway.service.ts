import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  SalesAgentRuntimeService,
  AgentReplyResult,
} from '../agent-runtime/sales-agent-runtime.service';
import { SalesConversationLock } from '../agent-runtime/sales-lock.service';
import { SalesMemoryService } from '../agent-runtime/sales-memory.service';
import {
  readSalesState,
  observeBuyer,
  SalesState,
} from '../agent-runtime/sales-state';
import { buildAgentContext } from '../agent-runtime/conversation-context';
import { ConversionInfrastructure } from '../conversion/conversion-infrastructure.service';
import { ChannelMessengerService } from '../channels/channel-messenger.service';
import { MetaWhatsAppClient } from '../channels/meta-whatsapp.client';
import { asWhatsAppMetadata } from '../channels/whatsapp-metadata';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { MediaService } from '../catalog/media.service';
import { OrderEmailService } from '../checkout/order-email.service';
import { InboxEventsService } from './inbox-events.service';

@Injectable()
export class SalesGatewayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SalesGatewayService.name);
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private stopped = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly runtime: SalesAgentRuntimeService,
    private readonly locks: SalesConversationLock,
    private readonly memory: SalesMemoryService,
    private readonly infra: ConversionInfrastructure,
    private readonly messenger: ChannelMessengerService,
    private readonly whatsapp: MetaWhatsAppClient,
    private readonly limits: PlanLimitsService,
    private readonly media: MediaService,
    private readonly events: InboxEventsService,
    private readonly emails: OrderEmailService,
  ) {}
  get enabled(): boolean {
    return (
      this.config.get('SALES_ENGINE_MODE', 'sales-engine-v2') ===
      'sales-engine-v2'
    );
  }
  async isDuplicate(
    tenantId: string,
    channelId: string,
    messageId: string,
  ): Promise<boolean> {
    try {
      return (
        (await this.infra.redis?.get(
          `wa:processed:${tenantId}:${channelId}:${messageId}`,
        )) === '1'
      );
    } catch {
      return false;
    }
  }
  async rememberInbound(
    tenantId: string,
    channelId: string,
    messageId: string,
  ): Promise<void> {
    try {
      await this.infra.redis?.set(
        `wa:processed:${tenantId}:${channelId}:${messageId}`,
        '1',
        'EX',
        86400,
      );
    } catch {
      /* Unique inboundKey persists independently. */
    }
  }
  onModuleInit(): void {
    if (this.config.get('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => {
      void this.drain().catch(() =>
        this.logger.warn('Sales inbox worker unavailable'),
      );
    }, 500);
    this.timer.unref();
  }
  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  async buffered(
    tenantId: string,
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    // Redis records the hot buffer; PostgreSQL remains durable if Redis loses the key.
    try {
      await this.infra.redis?.rpush(
        `wa:buffer:${tenantId}:${conversationId}`,
        messageId,
      );
      await this.infra.redis?.expire(
        `wa:buffer:${tenantId}:${conversationId}`,
        120,
      );
    } catch {
      /* Durable inbox is enough. */
    }
  }
  async drain(): Promise<void> {
    if (this.busy || this.stopped) return;
    this.busy = true;
    try {
      const [pending, unfinished] = await Promise.all([
        this.prisma.message.findMany({
          where: { enginePending: true },
          orderBy: { createdAt: 'asc' },
          take: 100,
          select: {
            conversationId: true,
            conversation: { select: { tenantId: true } },
          },
          distinct: ['conversationId'],
        }),
        this.prisma.salesEngineTurn.findMany({
          where: { status: { in: ['STARTED', 'READY', 'SENDING'] } },
          take: 20,
          orderBy: { updatedAt: 'asc' },
          select: { tenantId: true, conversationId: true },
        }),
      ]);
      const conversations = new Map(
        [
          ...unfinished,
          ...pending.map((m) => ({
            tenantId: m.conversation.tenantId,
            conversationId: m.conversationId,
          })),
        ].map((c) => [`${c.tenantId}/${c.conversationId}`, c]),
      );
      // Long advisory transactions reserve pool connections; concurrency must leave room for queries.
      const batch = [...conversations.values()].slice(
        0,
        Number(this.config.get('SALES_GATEWAY_CONCURRENCY', 1)),
      );
      await Promise.allSettled(
        batch.map((c) => this.process(c.tenantId, c.conversationId)),
      );
    } finally {
      this.busy = false;
    }
  }

  async process(tenantId: string, conversationId: string): Promise<void> {
    await this.locks.run(tenantId, conversationId, async (assertOwned) => {
      const conversation = await this.prisma.conversation.findFirst({
        where: { id: conversationId, tenantId },
        include: { channel: true },
      });
      if (!conversation || conversation.channel.type === 'TIKTOK_LIVE') return;
      const unfinished = await this.prisma.salesEngineTurn.findFirst({
        where: {
          tenantId,
          conversationId,
          status: { in: ['STARTED', 'READY', 'SENDING'] },
        },
        orderBy: { createdAt: 'asc' },
      });
      if (unfinished) {
        if (unfinished.status === 'READY' && conversation.agentEnabled) {
          await this.deliver(
            tenantId,
            conversationId,
            unfinished.id,
            unfinished.response as unknown as AgentReplyResult,
            assertOwned,
          );
        } else {
          // Obtaining the PG lock proves there is no live owner of this interrupted turn.
          await this.failTurn(
            tenantId,
            conversationId,
            unfinished.id,
            unfinished.inboundIds,
            'interrupted_turn',
          );
        }
        return;
      }
      const pending = await this.prisma.message.findMany({
        where: {
          conversationId,
          enginePending: true,
          conversation: { tenantId },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 20,
      });
      if (!pending.length) return;
      const latest = await this.prisma.message.findFirst({
        where: {
          conversationId,
          enginePending: true,
          conversation: { tenantId },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const debounce = Number(this.config.get('SALES_DEBOUNCE_MS', 2000));
      if (debounce > 0 && Date.now() - latest!.createdAt.getTime() < debounce)
        return;
      if (!conversation.agentEnabled) {
        await this.prisma.message.updateMany({
          where: {
            id: { in: pending.map((m) => m.id) },
            conversation: { tenantId },
          },
          data: { enginePending: false },
        });
        await this.prisma.conversation.updateMany({
          where: { id: conversationId, tenantId },
          data: { markedUnattended: true },
        });
        return;
      }
      const turn = await this.prisma.salesEngineTurn.create({
        data: {
          tenantId,
          conversationId,
          inboundIds: pending.map((m) => m.id),
        },
      });
      try {
        const assertActive = async () => {
          await assertOwned();
          const active = await this.prisma.conversation.findFirst({
            where: { id: conversationId, tenantId, agentEnabled: true },
            select: { id: true },
          });
          if (!active || this.stopped) throw new Error('SALES_AGENT_PAUSED');
        };
        const earlier = await this.prisma.message.findMany({
          where: {
            conversationId,
            enginePending: false,
            createdAt: { lte: pending[0].createdAt },
            conversation: { tenantId },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: Number(this.config.get('SALES_RECENT_MESSAGES_LIMIT', 20)) * 2,
          select: { authorType: true, body: true, metadata: true },
        });
        const context = buildAgentContext(
          earlier.reverse(),
          Number(this.config.get('SALES_RECENT_MESSAGES_LIMIT', 20)),
        );
        const customerKey = this.memory.customerKey(
          conversation.channelId,
          conversation.externalThreadId ?? conversationId,
        );
        const state = await this.memory.readState(
          tenantId,
          conversationId,
          readSalesState(conversation.salesState),
        );
        if (!(conversation.salesState as Partial<SalesState>)?.version) {
          // One-time hydration for legacy conversations. Read in pages, preserve facts without a giant prompt.
          let after: string | undefined;
          for (;;) {
            const old = await this.prisma.message.findMany({
              where: {
                conversationId,
                conversation: { tenantId },
                enginePending: false,
                authorType: 'BUYER',
                createdAt: { lte: pending[0].createdAt },
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              take: 100,
              ...(after ? { cursor: { id: after }, skip: 1 } : {}),
            });
            if (!old.length) break;
            for (const message of old)
              Object.assign(
                state,
                observeBuyer(
                  state,
                  message.body,
                  message.id,
                  message.createdAt,
                ),
              );
            after = old.at(-1)!.id;
            await assertActive();
          }
        }
        state.customerFacts = {
          ...(await this.memory.loadCustomer(tenantId, customerKey)),
          ...Object.fromEntries(
            Object.entries(state.customerFacts).filter(
              ([, fact]) =>
                !fact.expiresAt ||
                new Date(fact.expiresAt).getTime() > Date.now(),
            ),
          ),
        };
        if (state.stage === 'HUMAN_HANDOFF') {
          state.stage = 'DISCOVERY';
          state.handoffReason = undefined;
        }
        if (state.orderId) {
          const order = await this.prisma.order.findFirst({
            where: { id: state.orderId, tenantId, conversationId },
            select: { status: true },
          });
          state.paymentStatus = order?.status;
          if (
            order &&
            ['PAID', 'FULFILLING', 'SHIPPED', 'COMPLETED'].includes(
              order.status,
            )
          )
            state.stage = 'WON';
        }
        const result = await this.runtime.generateReply({
          tenantId,
          channelId: conversation.channelId,
          conversationId,
          inboundText: pending.map((m) => m.body).join('\n'),
          messageId: turn.id,
          salesState: state,
          customerName: conversation.contactName,
          customerPhone: conversation.contactPhone,
          history: context.history,
          shownImageProductIds: context.shownImageProductIds,
          allowAi: await this.limits.canUseAi(tenantId),
          assertOwned: assertActive,
        });
        await assertActive();
        if (result.usedAi) await this.limits.recordAiReply(tenantId);
        await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.salesEngineTurn.updateMany({
            where: { id: turn.id, tenantId, status: 'STARTED' },
            data: {
              status: 'READY',
              response: JSON.parse(
                JSON.stringify(result),
              ) as Prisma.InputJsonValue,
              trace: JSON.parse(
                JSON.stringify(result.trace ?? {}),
              ) as Prisma.InputJsonValue,
            },
          });
          if (!claimed.count) throw new Error('SALES_TURN_INTERRUPTED');
          const active = await tx.conversation.updateMany({
            where: { id: conversationId, tenantId, agentEnabled: true },
            data: {
              salesState: result.salesState as unknown as Prisma.InputJsonValue,
            },
          });
          if (!active.count) throw new Error('SALES_AGENT_PAUSED');
          await tx.message.updateMany({
            where: {
              id: { in: pending.map((m) => m.id) },
              conversation: { tenantId },
            },
            data: { enginePending: false },
          });
        });
        if (result.salesState) {
          await this.memory.cacheState(
            tenantId,
            conversationId,
            result.salesState,
          );
          await this.memory.saveCustomer(
            tenantId,
            customerKey,
            result.salesState,
          );
        }
        await this.deliver(
          tenantId,
          conversationId,
          turn.id,
          result,
          assertActive,
        );
        try {
          await this.infra.redis?.del(
            `wa:buffer:${tenantId}:${conversationId}`,
          );
        } catch {
          /* Optional. */
        }
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            event: 'sales_turn_failed',
            tenantId,
            conversationId,
            traceId: turn.id,
            errorClass: error instanceof Error ? error.name : 'unknown',
            databaseCode:
              error instanceof Prisma.PrismaClientKnownRequestError
                ? error.code
                : undefined,
          }),
        );
        await this.failTurn(
          tenantId,
          conversationId,
          turn.id,
          pending.map((m) => m.id),
          error instanceof Error && error.message === 'SALES_AGENT_PAUSED'
            ? 'operator_pause'
            : 'turn_failed',
        );
      }
    });
  }

  private async deliver(
    tenantId: string,
    conversationId: string,
    turnId: string,
    result: AgentReplyResult,
    assertOwned: () => Promise<void>,
  ): Promise<void> {
    await assertOwned();
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId, agentEnabled: true },
      include: { channel: true },
    });
    if (
      !conversation ||
      !this.messenger.recipientOf(conversation.channel, conversation) ||
      this.stopped ||
      !conversation.lastInboundAt ||
      Date.now() - conversation.lastInboundAt.getTime() >= 86400000
    ) {
      await this.failTurn(
        tenantId,
        conversationId,
        turnId,
        [],
        'delivery_not_allowed',
      );
      return;
    }
    const recipient = this.messenger.recipientOf(
      conversation.channel,
      conversation,
    )!;
    const claimed = await this.prisma.salesEngineTurn.updateMany({
      where: { id: turnId, tenantId, status: 'READY' },
      data: { status: 'SENDING' },
    });
    if (!claimed.count) return;
    const send = result.checkoutUrl
      ? await this.messenger.sendPaymentLink(conversation.channel, recipient, {
          text: result.replyText,
          url: result.checkoutUrl,
          footer: result.orderRef ? `Pedido ${result.orderRef}` : undefined,
        })
      : await this.messenger.sendText(
          conversation.channel,
          recipient,
          result.replyText,
        );
    if (!send?.ok) {
      await this.failTurn(
        tenantId,
        conversationId,
        turnId,
        [],
        'delivery_uncertain',
      );
      return;
    }
    // Commit confirmation immediately. A crash during later images cannot resend the text/payment link.
    await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          direction: 'OUTBOUND',
          authorType: 'SALES_AGENT',
          body: result.replyText,
          externalId: send.messageId,
          metadata: JSON.parse(
            JSON.stringify({
              tools: result.tools,
              usedCatalog: result.usedCatalog,
              escalate: result.escalate,
              orderId: result.orderId ?? null,
              checkoutUrl: result.checkoutUrl ?? null,
              engineTurnId: turnId,
            }),
          ) as Prisma.InputJsonValue,
        },
      }),
      this.prisma.salesEngineTurn.updateMany({
        where: { id: turnId, tenantId, status: 'SENDING' },
        data: { status: 'SENT' },
      }),
    ]);
    this.events.publish(tenantId, conversationId);
    const metadata = asWhatsAppMetadata(conversation.channel.metadata);
    for (const image of conversation.channel.type === 'WHATSAPP'
      ? result.images
      : []) {
      await assertOwned();
      if (
        !(await this.prisma.conversation.findFirst({
          where: { id: conversationId, tenantId, agentEnabled: true },
          select: { id: true },
        }))
      )
        break;
      if (!metadata) continue;
      const sent = await this.whatsapp.sendImageMessage({
        phoneNumberId: metadata.phoneNumberId,
        accessToken: metadata.accessToken,
        toPhone: recipient,
        caption: image.caption,
        cacheKey: image.imageUrl,
        loadJpeg: () => this.media.jpegForMessaging(image.imageUrl),
      });
      if (!sent.ok) continue;
      await this.prisma.message.create({
        data: {
          conversationId,
          direction: 'OUTBOUND',
          authorType: 'SALES_AGENT',
          body: image.caption,
          externalId: sent.messageId,
          metadata: {
            kind: 'image',
            imageUrl: image.imageUrl,
            productId: image.productId,
          },
        },
      });
      this.events.publish(tenantId, conversationId);
    }
    if (result.escalate) {
      await this.prisma.conversation.updateMany({
        where: { id: conversationId, tenantId },
        data: {
          markedUnattended: true,
          ...(result.pauseOnHandoff
            ? { agentEnabled: false, status: 'PAUSED' }
            : {}),
        },
      });
      this.events.publish(tenantId, conversationId, 'conversation');
      void this.emails
        .sendHandoffAlert(tenantId, conversationId, result.pauseOnHandoff)
        .catch(() => this.logger.warn('Sales handoff alert unavailable'));
    }
  }
  private async failTurn(
    tenantId: string,
    conversationId: string,
    turnId: string,
    inboundIds: string[],
    errorCode: string,
  ): Promise<void> {
    // No blind retry: a previous action may already have committed or Meta may have accepted a send.
    const current = await this.prisma.salesEngineTurn.findFirst({
      where: { id: turnId, tenantId },
    });
    if (current?.status === 'SENT') return;
    const row = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      select: { salesState: true },
    });
    const state = readSalesState(row?.salesState);
    state.stage = 'HUMAN_HANDOFF';
    state.handoffReason = errorCode;
    state.nextBestAction = 'handoff_to_human';
    state.summary.nextStep = `operator_review:${errorCode}`;
    await this.prisma.$transaction([
      this.prisma.salesEngineTurn.updateMany({
        where: { id: turnId, tenantId },
        data: {
          status: current?.status === 'SENDING' ? 'UNKNOWN' : 'FAILED',
          trace: { errorCode },
        },
      }),
      this.prisma.message.updateMany({
        where: { id: { in: inboundIds }, conversation: { tenantId } },
        data: { enginePending: false },
      }),
      this.prisma.conversation.updateMany({
        where: { id: conversationId, tenantId },
        data: {
          agentEnabled: false,
          status: 'PAUSED',
          markedUnattended: true,
          salesState: state,
        },
      }),
    ]);
    this.events.publish(tenantId, conversationId, 'conversation');
    this.logger.warn(
      JSON.stringify({
        event: 'sales_turn_requires_review',
        tenantId,
        conversationId,
        traceId: turnId,
        errorCode,
      }),
    );
  }
}
