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
import { MetaWhatsAppClient } from './meta-whatsapp.client';
import { asWhatsAppMetadata } from './whatsapp-metadata';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly conversations: ConversationsService,
    private readonly metaWhatsApp: MetaWhatsAppClient,
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
          ? 'Usa el token de verificación que te indicó VendedorIA.'
          : 'La verificación del webhook aún no está activa. Escríbenos a soporte.',
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

  async getWhatsAppDiagnostics(tenantId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { tenantId, type: 'WHATSAPP' },
    });

    const publicBase =
      this.config.get<string>('PUBLIC_API_BASE_URL') ??
      'http://localhost:3000/api/v1';
    const verifyToken = this.config.get<string>('META_VERIFY_TOKEN');
    const appSecret = this.config.get<string>('META_APP_SECRET');
    const callbackUrl = `${publicBase}/webhooks/meta/whatsapp`;

    if (!channel) {
      return {
        connected: false,
        healthStatus: 'PENDING' as const,
        checks: [
          {
            id: 'channel',
            label: 'Canal WhatsApp',
            status: 'error' as const,
            detail: 'Aún no conectaste Phone Number ID ni token.',
          },
        ],
        nextSteps: [
          'Completa el formulario de conexión con Meta Cloud API.',
          `Registra el webhook en Meta: ${callbackUrl}`,
        ],
      };
    }

    const metadata = asWhatsAppMetadata(channel.metadata);
    const hasToken = Boolean(metadata?.accessToken);
    const checks: Array<{
      id: string;
      label: string;
      status: 'ok' | 'warn' | 'error';
      detail: string;
    }> = [
      {
        id: 'channel',
        label: 'Canal registrado',
        status: 'ok',
        detail: `${channel.displayName ?? 'WhatsApp'} · ${channel.externalId ?? 'sin ID'}`,
      },
      {
        id: 'token',
        label: 'Access token',
        status: hasToken ? 'ok' : 'error',
        detail: hasToken
          ? 'Token guardado en el canal.'
          : 'Falta access token de Meta.',
      },
      {
        id: 'verify',
        label: 'Verificación del webhook',
        status: verifyToken ? 'ok' : 'warn',
        detail: verifyToken
          ? 'Meta puede verificar el webhook.'
          : 'La verificación del webhook aún no está activa. Escríbenos a soporte.',
      },
      {
        id: 'signature',
        label: 'Firma de mensajes',
        status: appSecret ? 'ok' : 'warn',
        detail: appSecret
          ? 'Solo se aceptan mensajes firmados por Meta.'
          : 'La firma de mensajes de Meta aún no está activa. Escríbenos a soporte.',
      },
      {
        id: 'webhook',
        label: 'Webhook URL',
        status: 'ok',
        detail: callbackUrl,
      },
    ];

    if (metadata?.accessToken && metadata.phoneNumberId) {
      const tokenCheck = await this.metaWhatsApp.verifyCredentials({
        phoneNumberId: metadata.phoneNumberId,
        accessToken: metadata.accessToken,
      });
      checks.push({
        id: 'graph',
        label: 'Token válido (Graph API)',
        status: tokenCheck.ok ? 'ok' : 'error',
        detail: tokenCheck.ok
          ? tokenCheck.displayName
            ? `Conectado como ${tokenCheck.displayName}`
            : 'Meta respondió OK.'
          : tokenCheck.error ?? 'Token rechazado por Meta.',
      });
    }

    const hoursSinceActivity = channel.lastActiveAt
      ? (Date.now() - channel.lastActiveAt.getTime()) / (1000 * 60 * 60)
      : null;
    checks.push({
      id: 'activity',
      label: 'Última actividad',
      status:
        hoursSinceActivity === null
          ? 'warn'
          : hoursSinceActivity > 72
            ? 'warn'
            : 'ok',
      detail: channel.lastActiveAt
        ? `Hace ${Math.round(hoursSinceActivity ?? 0)} h · ${channel.lastActiveAt.toISOString()}`
        : 'Aún no llegan mensajes. Escribe a tu número de WhatsApp para probar.',
    });

    const hasError = checks.some((item) => item.status === 'error');
    const hasWarn = checks.some((item) => item.status === 'warn');
    const healthStatus = hasError
      ? 'DISCONNECTED'
      : hasWarn
        ? 'DEGRADED'
        : 'CONNECTED';

    if (channel.healthStatus !== healthStatus) {
      await this.prisma.channel.update({
        where: { id: channel.id },
        data: { healthStatus },
      });
    }

    const nextSteps: string[] = [];
    if (!verifyToken) {
      nextSteps.push('Escríbenos a soporte para activar la verificación del webhook.');
    }
    if (!hasToken) {
      nextSteps.push('Pega un access token válido y guarda la conexión.');
    }
    if (checks.find((item) => item.id === 'graph')?.status === 'error') {
      nextSteps.push(
        'Regenera el token en Meta Business · permisos whatsapp_business_messaging.',
      );
    }
    if (hoursSinceActivity === null || (hoursSinceActivity ?? 0) > 72) {
      nextSteps.push(
        'Envía un mensaje de prueba a tu número para confirmar que llega.',
      );
    }
    if (!nextSteps.length) {
      nextSteps.push('Canal sano. Revisa Mensajes cuando llegue tráfico real.');
    }

    return {
      connected: true,
      healthStatus,
      channel: {
        id: channel.id,
        displayName: channel.displayName,
        externalId: channel.externalId,
        connectionMode: channel.connectionMode,
        lastActiveAt: channel.lastActiveAt,
      },
      checks,
      nextSteps,
    };
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

  assertMetaSignature(rawBody: Buffer | undefined, signatureHeader?: string) {
    const appSecret = this.config.get<string>('META_APP_SECRET');
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
