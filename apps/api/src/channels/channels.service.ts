import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import {
  ConnectWhatsAppDto,
  SimulateInboundDto,
} from './dto/channels.dto';
import { asWhatsAppMetadata } from './whatsapp-metadata';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly conversations: ConversationsService,
  ) {}

  list(tenantId: string) {
    return this.prisma.channel.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        type: true,
        connectionMode: true,
        healthStatus: true,
        externalId: true,
        displayName: true,
        lastActiveAt: true,
        createdAt: true,
        updatedAt: true,
        metadata: true,
      },
    }).then((channels) =>
      channels.map((channel) => ({
        ...channel,
        metadata: this.publicMetadata(channel.metadata),
      })),
    );
  }

  async connectWhatsApp(tenantId: string, dto: ConnectWhatsAppDto) {
    const metadata = {
      accessToken: dto.accessToken,
      phoneNumberId: dto.phoneNumberId,
      wabaId: dto.wabaId,
    };

    const existing = await this.prisma.channel.findFirst({
      where: { tenantId, type: 'WHATSAPP' },
    });

    const channel = existing
      ? await this.prisma.channel.update({
          where: { id: existing.id },
          data: {
            externalId: dto.phoneNumberId,
            displayName: dto.displayName ?? existing.displayName,
            connectionMode: dto.connectionMode ?? 'NEW_WABA_NUMBER',
            healthStatus: 'CONNECTED',
            metadata,
            lastActiveAt: new Date(),
          },
        })
      : await this.prisma.channel.create({
          data: {
            tenantId,
            type: 'WHATSAPP',
            externalId: dto.phoneNumberId,
            displayName: dto.displayName ?? 'WhatsApp Business',
            connectionMode: dto.connectionMode ?? 'NEW_WABA_NUMBER',
            healthStatus: 'CONNECTED',
            metadata,
            lastActiveAt: new Date(),
          },
        });

    const verifyToken = this.config.get<string>('META_VERIFY_TOKEN');
    const publicBase =
      this.config.get<string>('PUBLIC_API_BASE_URL') ??
      'http://localhost:3000/api/v1';

    return {
      channel: {
        ...channel,
        metadata: this.publicMetadata(channel.metadata),
      },
      webhook: {
        callbackUrl: `${publicBase}/webhooks/meta/whatsapp`,
        verifyTokenConfigured: Boolean(verifyToken),
        verifyTokenHint: verifyToken
          ? 'Usa el META_VERIFY_TOKEN configurado en el servidor'
          : 'Configura META_VERIFY_TOKEN en el entorno del API',
      },
    };
  }

  async markDisconnected(tenantId: string, channelId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, tenantId },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    return this.prisma.channel.update({
      where: { id: channelId },
      data: { healthStatus: 'DISCONNECTED' },
      select: {
        id: true,
        type: true,
        healthStatus: true,
        displayName: true,
        updatedAt: true,
      },
    });
  }

  verifyMetaWebhook(mode?: string, token?: string, challenge?: string) {
    const verifyToken = this.config.get<string>('META_VERIFY_TOKEN');
    if (!verifyToken) {
      throw new BadRequestException('META_VERIFY_TOKEN is not configured');
    }
    if (mode === 'subscribe' && token === verifyToken && challenge) {
      return challenge;
    }
    throw new UnauthorizedException('Webhook verification failed');
  }

  assertMetaSignature(rawBody: string, signatureHeader?: string) {
    const appSecret = this.config.get<string>('META_APP_SECRET');
    if (!appSecret) {
      return;
    }
    if (!signatureHeader?.startsWith('sha256=')) {
      throw new UnauthorizedException('Missing Meta signature');
    }
    const expected = createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');
    const provided = signatureHeader.slice('sha256='.length);
    const expectedBuf = Buffer.from(expected, 'utf8');
    const providedBuf = Buffer.from(provided, 'utf8');
    if (
      expectedBuf.length !== providedBuf.length ||
      !timingSafeEqual(expectedBuf, providedBuf)
    ) {
      throw new UnauthorizedException('Invalid Meta signature');
    }
  }

  async handleMetaWebhook(payload: MetaWebhookPayload) {
    const entries = payload.entry ?? [];
    const results = [];

    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') {
          continue;
        }
        const value = change.value;
        const phoneNumberId = value?.metadata?.phone_number_id;
        if (!phoneNumberId || !value?.messages?.length) {
          continue;
        }

        for (const message of value.messages) {
          if (message.type !== 'text' || !message.text?.body) {
            continue;
          }
          const contact = value.contacts?.find((item) => item.wa_id === message.from);
          results.push(
            await this.conversations.ingestInboundWhatsApp({
              phoneNumberId,
              fromPhone: message.from,
              contactName: contact?.profile?.name,
              text: message.text.body,
              externalMessageId: message.id,
            }),
          );
        }
      }
    }

    return { processed: results.length, results };
  }

  async simulateInbound(tenantId: string, dto: SimulateInboundDto) {
    const channel = await this.prisma.channel.findFirst({
      where: { tenantId, type: 'WHATSAPP' },
    });
    if (!channel?.externalId) {
      throw new BadRequestException(
        'Conecta WhatsApp antes de simular un mensaje entrante.',
      );
    }

    return this.conversations.ingestInboundWhatsApp({
      phoneNumberId: channel.externalId,
      fromPhone: dto.fromPhone.replace(/\D/g, ''),
      contactName: dto.contactName,
      text: dto.text,
      externalMessageId: `sim_${Date.now()}`,
    });
  }

  private publicMetadata(metadata: unknown) {
    const parsed = asWhatsAppMetadata(metadata);
    if (!parsed) {
      return null;
    }
    return {
      phoneNumberId: parsed.phoneNumberId,
      wabaId: parsed.wabaId,
      hasAccessToken: true,
    };
  }
}

type MetaWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{
          id?: string;
          from: string;
          type?: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
};
