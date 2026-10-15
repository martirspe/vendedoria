import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { assertManager } from '../common/roles';
import type { AuthUserPayload } from '../common/types/auth-user';
import { isIntegrationActive } from '../integrations/integration-state';
import {
  ConnectInstagramDto,
  SimulateInboundDto,
} from './dto/channels.dto';
import { asInstagramMetadata, isPlaceholderToken, MetaInstagramClient } from './meta-instagram.client';
import { MetaWhatsAppClient } from './meta-whatsapp.client';
import { asWhatsAppMetadata, publicWhatsAppMetadata } from './whatsapp-metadata';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly conversations: ConversationsService,
    private readonly metaWhatsApp: MetaWhatsAppClient,
    private readonly metaInstagram: MetaInstagramClient,
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

  async connectInstagram(user: AuthUserPayload, dto: ConnectInstagramDto) {
    assertManager(user, 'Solo el dueño o un administrador puede conectar Instagram.');
    const tenantId = user.tenantId;
    if (!(await isIntegrationActive(this.prisma, tenantId, 'instagram'))) {
      throw new ForbiddenException('Activa «Instagram Direct» en Integraciones para conectar tu cuenta.');
    }

    let accountId: string;
    let username: string | null = null;
    if (isPlaceholderToken(dto.accessToken) && this.config.get<string>('NODE_ENV') !== 'production') {
      if (!dto.accountId) {
        throw new BadRequestException('Indica el ID de la cuenta de Instagram.');
      }
      accountId = dto.accountId;
    } else {
      const account = await this.metaInstagram.fetchAccount(dto.accessToken);
      if (!account.ok) {
        throw new BadRequestException(
          'Instagram no aceptó el token. Genera uno nuevo desde tu app de Meta y vuelve a intentarlo.',
        );
      }
      accountId = account.accountId;
      username = account.username;
    }

    const takenElsewhere = await this.prisma.channel.findFirst({
      where: { type: 'INSTAGRAM', externalId: accountId, tenantId: { not: tenantId } },
      select: { id: true },
    });
    if (takenElsewhere) {
      throw new ConflictException('Esa cuenta de Instagram ya está conectada a otro negocio.');
    }

    const metadata = { accessToken: dto.accessToken, accountId, ...(username ? { username } : {}) };
    const displayName = username ? `@${username}` : 'Instagram';
    const existing = await this.prisma.channel.findFirst({ where: { tenantId, type: 'INSTAGRAM' } });
    const channel = existing
      ? await this.prisma.channel.update({
          where: { id: existing.id },
          data: { externalId: accountId, displayName, healthStatus: 'CONNECTED', metadata, lastActiveAt: new Date() },
        })
      : await this.prisma.channel.create({
          data: {
            tenantId,
            type: 'INSTAGRAM',
            externalId: accountId,
            displayName,
            healthStatus: 'CONNECTED',
            metadata,
            lastActiveAt: new Date(),
          },
        });

    return {
      channel: { ...channel, metadata: this.publicMetadata(channel.metadata) },
      webhook: this.instagramWebhookInfo(),
    };
  }

  async getInstagramStatus(tenantId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { tenantId, type: 'INSTAGRAM' },
      select: { id: true, displayName: true, externalId: true, healthStatus: true, lastActiveAt: true, metadata: true },
    });
    return {
      channel: channel ? { ...channel, metadata: this.publicMetadata(channel.metadata) } : null,
      webhook: this.instagramWebhookInfo(),
    };
  }

  private instagramWebhookInfo() {
    const publicBase = this.config.get<string>('PUBLIC_API_BASE_URL') ?? 'http://localhost:3000/api/v1';
    return {
      callbackUrl: `${publicBase}/webhooks/meta/instagram`,
      verifyTokenConfigured: Boolean(this.config.get<string>('META_VERIFY_TOKEN')),
      signatureConfigured: Boolean(this.instagramAppSecret()),
    };
  }

  private instagramAppSecret(): string | undefined {
    return this.config.get<string>('INSTAGRAM_APP_SECRET') || this.config.get<string>('META_APP_SECRET');
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

  assertMetaSignature(
    rawBody: Buffer | undefined,
    signatureHeader?: string,
    appSecret = this.config.get<string>('META_APP_SECRET'),
  ) {
    if (!appSecret) {
      // Unsigned webhooks are accepted only outside production.
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new UnauthorizedException('Meta webhook signature is not configured');
      }
      return;
    }
    if (!rawBody || !signatureHeader?.startsWith('sha256=')) {
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

  async handleMetaWebhook(payload: MetaWebhookPayload, connection?: { tenantId: string; channelId: string; phoneNumberId: string; wabaId: string }) {
    const entries = payload.entry ?? [];
    const results = [];

    for (const entry of entries) {
      if (connection && entry.id !== connection.wabaId) continue;
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') {
          continue;
        }
        const value = change.value;
        const phoneNumberId = value?.metadata?.phone_number_id;
        if (connection && phoneNumberId !== connection.phoneNumberId) continue;
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
              ...(connection ? { tenantId: connection.tenantId, channelId: connection.channelId } : {}),
            }),
          );
        }
      }
    }

    return { processed: results.length, results };
  }

  assertInstagramSignature(rawBody: Buffer | undefined, signatureHeader?: string) {
    this.assertMetaSignature(rawBody, signatureHeader, this.instagramAppSecret());
  }

  async handleInstagramWebhook(payload: InstagramWebhookPayload) {
    const results = [];
    for (const entry of payload.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        const text = event.message?.text;
        const senderId = event.sender?.id;
        const accountId = event.recipient?.id ?? entry.id;
        if (!text || !senderId || !accountId || event.message?.is_echo || senderId === accountId) {
          continue;
        }
        results.push(
          await this.conversations.ingestInboundInstagram({
            accountId: String(accountId),
            senderId: String(senderId),
            text,
            externalMessageId: event.message?.mid,
          }),
        );
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
    const instagram = asInstagramMetadata(metadata);
    if (instagram) {
      return { accountId: instagram.accountId, username: instagram.username ?? null, hasAccessToken: true };
    }
    return publicWhatsAppMetadata(metadata);
  }
}

type InstagramWebhookPayload = {
  entry?: Array<{
    id?: string;
    messaging?: Array<{
      sender?: { id?: string };
      recipient?: { id?: string };
      message?: { mid?: string; text?: string; is_echo?: boolean };
    }>;
  }>;
};

type MetaWebhookPayload = {
  entry?: Array<{
    id?: string;
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
