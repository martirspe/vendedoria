import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiveIntegration, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { assertManager } from '../common/roles';
import { AuthUserPayload } from '../common/types/auth-user';
import { isIntegrationActive } from '../integrations/integration-state';
import {
  decryptSecret,
  encryptSecret,
  parseCredentialsKey,
} from '../payments/credentials-cipher';
import { PrismaService } from '../prisma/prisma.service';
import { LiveSettingsDto, TikTokCallbackDto } from './dto/live.dto';
import { TikTokLiveAdapter } from './live-adapter';
import {
  TikTokClient,
  TikTokTokens,
  verifyTikTokSignature,
} from './tiktok-client';

const hash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
type StoredTikTokTokens = TikTokTokens & { authorizedAt?: number };

@Injectable()
export class TikTokIntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly client: TikTokClient,
    private readonly adapter: TikTokLiveAdapter,
  ) {}

  async view(tenantId: string) {
    const [row, active] = await Promise.all([
      this.prisma.liveIntegration.findUnique({ where: { tenantId } }),
      isIntegrationActive(this.prisma, tenantId, 'tiktok_live'),
    ]);
    return {
      enabled: active,
      oauthAvailable: this.client.available,
      healthStatus: active ? (row?.healthStatus ?? 'PENDING') : 'DISCONNECTED',
      connected: Boolean(
        active &&
        row?.credentialsEncrypted &&
        row.healthStatus === 'CONNECTED' &&
        row.accessExpiresAt &&
        row.accessExpiresAt > new Date(),
      ),
      accountId: row?.accountId ?? null,
      scopes: row?.scopes ?? [],
      capabilities: this.adapter.capabilities(
        row?.credentialsEncrypted ? row.scopes : [],
      ),
      responseMode: row?.responseMode ?? 'HUMAN_APPROVAL',
      reservationSeconds: row?.reservationSeconds ?? 300,
      maxReservationsPerSession: row?.maxReservationsPerSession ?? 500,
      lastCheckedAt: row?.lastCheckedAt ?? null,
      lastEventAt: row?.lastEventAt ?? null,
      errorCode: row?.errorCode ?? null,
      webhook: {
        configured: Boolean(this.config.get<string>('TIKTOK_CLIENT_SECRET')),
        url: `${this.config.get<string>('PUBLIC_API_BASE_URL', '').replace(/\/$/, '')}/webhooks/tiktok`,
        events: ['authorization.removed'],
      },
    };
  }
  async requireActive(tenantId: string): Promise<LiveIntegration> {
    if (!(await isIntegrationActive(this.prisma, tenantId, 'tiktok_live')))
      throw new ForbiddenException(
        'Activa TikTok LIVE y Tienda web en Integraciones para continuar.',
      );
    return this.prisma.liveIntegration.upsert({
      where: { tenantId },
      create: { tenantId, capabilities: this.adapter.capabilities([]) },
      update: {},
    });
  }
  async settings(user: AuthUserPayload, dto: LiveSettingsDto) {
    assertManager(
      user,
      'Solo el dueño o un administrador puede configurar TikTok LIVE.',
    );
    const row = await this.requireActive(user.tenantId);
    if (
      dto.responseMode === 'AUTO' &&
      this.adapter.capabilities(row.scopes).outboundReplies !== 'supported'
    )
      throw new BadRequestException(
        'Tu conexión no permite respuestas automáticas LIVE. Usa aprobación humana o solo clasificación.',
      );
    await this.prisma.liveIntegration.update({
      where: { tenantId: user.tenantId },
      data: dto,
    });
    return this.view(user.tenantId);
  }
  async begin(user: AuthUserPayload) {
    assertManager(
      user,
      'Solo el dueño o un administrador puede conectar TikTok.',
    );
    await this.requireActive(user.tenantId);
    const state = randomBytes(32).toString('base64url');
    const url = this.client.authorizationUrl(state);
    await this.prisma.liveIntegration.update({
      where: { tenantId: user.tenantId },
      data: {
        oauthStateHash: hash(state),
        oauthExpiresAt: new Date(Date.now() + 600000),
      },
    });
    return { state, url };
  }
  async callback(dto: TikTokCallbackDto): Promise<void> {
    const row = await this.prisma.liveIntegration.findFirst({
      where: {
        oauthStateHash: hash(dto.state),
        oauthExpiresAt: { gt: new Date() },
      },
    });
    if (!row)
      throw new UnauthorizedException(
        'La autorización de TikTok venció. Conecta tu cuenta de nuevo.',
      );
    await this.requireActive(row.tenantId);
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const fresh = await this.lock(tx, row.tenantId);
          if (
            fresh.oauthStateHash !== hash(dto.state) ||
            !fresh.oauthExpiresAt ||
            fresh.oauthExpiresAt <= new Date()
          )
            throw new UnauthorizedException(
              'La autorización de TikTok venció.',
            );
          await tx.liveIntegration.update({
            where: { tenantId: row.tenantId },
            data: { oauthStateHash: null, oauthExpiresAt: null },
          });
          if (dto.error || !dto.code) {
            await tx.liveIntegration.update({
              where: { tenantId: row.tenantId },
              data: { errorCode: 'authorization_denied' },
            });
            return;
          }
          const tokens = await this.client.exchange(dto.code);
          const channel = fresh.channelId
            ? await tx.channel.findFirst({
                where: { id: fresh.channelId, tenantId: row.tenantId },
              })
            : null;
          const local =
            channel ??
            (await tx.channel.create({
              data: {
                tenantId: row.tenantId,
                type: 'TIKTOK_LIVE',
                displayName: 'TikTok LIVE · gestión manual',
                externalId: tokens.open_id,
                healthStatus: 'PENDING',
              },
            }));
          await tx.channel.updateMany({
            where: { id: local.id, tenantId: row.tenantId },
            data: { externalId: tokens.open_id },
          });
          await tx.liveIntegration.update({
            where: { tenantId: row.tenantId },
            data: { ...this.tokenData(tokens), channelId: local.id },
          });
        },
        { timeout: 20000 },
      );
    } catch (error) {
      // A failed code exchange also consumes this authorization attempt, without clearing a newer one.
      await this.prisma.liveIntegration.updateMany({
        where: { tenantId: row.tenantId, oauthStateHash: hash(dto.state) },
        data: {
          oauthStateHash: null,
          oauthExpiresAt: null,
          errorCode: 'authorization_failed',
        },
      });
      throw error;
    }
  }
  async verify(user: AuthUserPayload) {
    assertManager(
      user,
      'Solo el dueño o un administrador puede validar TikTok.',
    );
    await this.requireActive(user.tenantId);
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const row = await this.lock(tx, user.tenantId);
          if (!row.credentialsEncrypted || !row.accountId)
            throw new BadRequestException(
              'Conecta tu cuenta con TikTok primero.',
            );
          let tokens = JSON.parse(
            decryptSecret(this.key(), row.credentialsEncrypted),
          ) as StoredTikTokTokens;
          const authorizedAt = tokens.authorizedAt;
          if (
            !row.accessExpiresAt ||
            row.accessExpiresAt.getTime() <= Date.now() + 60000
          ) {
            if (!row.refreshExpiresAt || row.refreshExpiresAt <= new Date())
              throw new UnauthorizedException(
                'Vuelve a conectar tu cuenta TikTok.',
              );
            tokens = await this.client.refresh(tokens.refresh_token);
            if (tokens.open_id !== row.accountId)
              throw new UnauthorizedException(
                'TikTok devolvió una cuenta diferente. Vuelve a conectarla.',
              );
            await tx.liveIntegration.update({
              where: { tenantId: user.tenantId },
              data: this.tokenData(tokens, authorizedAt),
            });
          }
          try {
            await this.client.verifyAccount(tokens.access_token, row.accountId);
          } catch {
            // Commit rotated refresh credentials even when the subsequent identity check fails.
            await tx.liveIntegration.update({
              where: { tenantId: user.tenantId },
              data: {
                lastCheckedAt: new Date(),
                healthStatus: 'DEGRADED',
                errorCode: 'verification_failed',
              },
            });
            return;
          }
          await tx.liveIntegration.update({
            where: { tenantId: user.tenantId },
            data: {
              lastCheckedAt: new Date(),
              healthStatus: 'CONNECTED',
              errorCode: null,
            },
          });
        },
        { timeout: 25000 },
      );
    } catch (error) {
      await this.prisma.liveIntegration.updateMany({
        where: { tenantId: user.tenantId },
        data: {
          healthStatus: 'DEGRADED',
          errorCode: 'reconnect_required',
          lastCheckedAt: new Date(),
        },
      });
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException
      )
        throw error;
      throw new BadRequestException(
        'No pudimos validar tu conexión. Vuelve a conectar TikTok.',
      );
    }
    const view = await this.view(user.tenantId);
    if (view.healthStatus !== 'CONNECTED')
      throw new BadRequestException(
        'No pudimos validar tu conexión. Reintenta o vuelve a conectar TikTok.',
      );
    return view;
  }
  async disconnect(user: AuthUserPayload) {
    assertManager(
      user,
      'Solo el dueño o un administrador puede desconectar TikTok.',
    );
    await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.liveIntegration.findUnique({
          where: { tenantId: user.tenantId },
        });
        if (!existing) return;
        const row = await this.lock(tx, user.tenantId);
        if (row.credentialsEncrypted) {
          const tokens = JSON.parse(
            decryptSecret(this.key(), row.credentialsEncrypted),
          ) as TikTokTokens;
          await this.client.revoke(tokens.access_token);
        }
        await tx.liveIntegration.update({
          where: { tenantId: user.tenantId },
          data: {
            credentialsEncrypted: null,
            accountId: null,
            scopes: [],
            capabilities: this.adapter.capabilities([]),
            healthStatus: 'DISCONNECTED',
            oauthStateHash: null,
            oauthExpiresAt: null,
            accessExpiresAt: null,
            refreshExpiresAt: null,
            errorCode: null,
          },
        });
      },
      { timeout: 15000 },
    );
    return this.view(user.tenantId);
  }
  async webhook(body: Buffer, signature: string | undefined): Promise<void> {
    if (
      !verifyTikTokSignature(
        this.config.get<string>('TIKTOK_CLIENT_SECRET', ''),
        signature,
        body,
      )
    )
      throw new UnauthorizedException('Firma de TikTok inválida.');
    let event: {
      event?: string;
      client_key?: string;
      user_openid?: string;
      create_time?: number;
    };
    try {
      event = JSON.parse(body.toString('utf8')) as typeof event;
    } catch {
      throw new BadRequestException('Evento inválido.');
    }
    if (
      !event ||
      event.client_key !== this.config.get<string>('TIKTOK_CLIENT_KEY') ||
      typeof event.user_openid !== 'string' ||
      !Number.isFinite(event.create_time)
    )
      throw new BadRequestException('Evento de TikTok inválido.');
    if (event.event !== 'authorization.removed') return;
    const rows = await this.prisma.liveIntegration.findMany({
      where: { accountId: event.user_openid },
    });
    for (const row of rows) {
      if (
        !(await isIntegrationActive(this.prisma, row.tenantId, 'tiktok_live'))
      )
        continue;
      await this.prisma.$transaction(async (tx) => {
        const fresh = await this.lock(tx, row.tenantId);
        const claimed = await tx.webhookEvent.createMany({
          data: {
            key: `tiktok:${row.tenantId}:${hash(`${event.client_key}:${event.user_openid}:${event.event}:${event.create_time}`)}`,
            tenantId: row.tenantId,
            providerId: 'tiktok',
          },
          skipDuplicates: true,
        });
        if (!claimed.count) return;
        if (fresh.credentialsEncrypted) {
          const stored = JSON.parse(
            decryptSecret(this.key(), fresh.credentialsEncrypted),
          ) as StoredTikTokTokens;
          // A delayed revocation must not erase a later authorization of the same account.
          if (
            stored.authorizedAt &&
            (event.create_time ?? 0) < Math.floor(stored.authorizedAt / 1000)
          )
            return;
        }
        await tx.liveIntegration.updateMany({
          where: { tenantId: row.tenantId, accountId: event.user_openid },
          data: {
            credentialsEncrypted: null,
            scopes: [],
            capabilities: this.adapter.capabilities([]),
            healthStatus: 'DISCONNECTED',
            errorCode: 'authorization_removed',
            lastEventAt: new Date(),
            oauthStateHash: null,
            oauthExpiresAt: null,
          },
        });
      });
    }
  }
  private key(): Buffer {
    const key = parseCredentialsKey(
      this.config.get<string>('PAYMENT_CREDENTIALS_KEY'),
    );
    if (!key)
      throw new BadRequestException(
        'La conexión de TikTok requiere cifrado de credenciales.',
      );
    return key;
  }
  private tokenData(tokens: TikTokTokens, authorizedAt = Date.now()) {
    const scopes = tokens.scope.split(',').filter(Boolean);
    return {
      credentialsEncrypted: encryptSecret(
        this.key(),
        JSON.stringify({ ...tokens, authorizedAt }),
      ),
      accountId: tokens.open_id,
      scopes,
      capabilities: this.adapter.capabilities(scopes),
      accessExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      refreshExpiresAt: new Date(Date.now() + tokens.refresh_expires_in * 1000),
      healthStatus: 'CONNECTED' as const,
      errorCode: null,
      lastCheckedAt: new Date(),
    };
  }
  private async lock(tx: Prisma.TransactionClient, tenantId: string) {
    await tx.$queryRaw`SELECT "tenantId" FROM "LiveIntegration" WHERE "tenantId" = ${tenantId} FOR UPDATE`;
    return tx.liveIntegration.findUniqueOrThrow({ where: { tenantId } });
  }
}
