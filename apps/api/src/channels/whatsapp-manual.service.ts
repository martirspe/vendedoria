import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Channel, Prisma } from '@prisma/client';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { assertManager } from '../common/roles';
import type { AuthUserPayload } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelCredentialsService } from './channel-credentials.service';
import { ChannelsService } from './channels.service';
import type { ConnectWhatsAppManualDto } from './dto/whatsapp-manual.dto';
import { MetaAuthorizationExpiredException, MetaSignupClient } from './meta-signup.client';
import { publicWhatsAppMetadata } from './whatsapp-metadata';

const digest = (value: string) => createHash('sha256').update(value).digest();

@Injectable()
export class WhatsAppManualService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService,
    private readonly credentials: ChannelCredentialsService, private readonly meta: MetaSignupClient,
    private readonly channels: ChannelsService) {}

  get available(): boolean {
    return this.credentials.configured && /^https:\/\//.test(this.config.get<string>('PUBLIC_API_BASE_URL') || '');
  }

  async connect(user: AuthUserPayload, dto: ConnectWhatsAppManualDto) {
    this.manager(user);
    if (!this.available) throw new ServiceUnavailableException('La conexión con credenciales propias aún no está disponible. Contacta con soporte.');
    if (dto.appId === this.meta.appId) throw new BadRequestException('Usa la app de tu negocio para conectar con credenciales propias. La app de VendedorIA se conecta mediante autorización con Meta.');
    const client = this.meta.forApp(dto.appId, dto.appSecret);
    const phone = await client.ownPhone(dto.accessToken, dto.wabaId, dto.phoneNumberId);
    if (!phone.registered) throw new BadRequestException('Activa el número en WhatsApp Cloud API desde Meta antes de conectarlo con credenciales propias.');
    const verifyToken = randomBytes(32).toString('base64url');
    const channel = await this.prisma.$transaction(async tx => {
      for (const key of [`wa:tenant:${user.tenantId}`, `wa:waba:${phone.wabaId}`, `wa:phone:${phone.id}`, `wa:app:${dto.appId}`].sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      }
      const taken = await tx.channel.findFirst({ where: { type: 'WHATSAPP', tenantId: { not: user.tenantId }, healthStatus: { not: 'DISCONNECTED' }, OR: [
        { externalId: phone.id }, { metadata: { path: ['wabaId'], equals: phone.wabaId } }, { metadata: { path: ['appId'], equals: dto.appId } },
      ] }, select: { id: true } });
      if (taken) throw new ConflictException('Esta app, cuenta o número ya está vinculado a otro negocio.');
      const existing = await tx.channel.findFirst({ where: { tenantId: user.tenantId, type: 'WHATSAPP' } });
      if (existing && existing.healthStatus !== 'DISCONNECTED') throw new ConflictException('Desconecta la conexión actual antes de configurar credenciales propias.');
      const data = { externalId: phone.id, displayName: phone.displayName, healthStatus: 'PENDING' as const,
        connectionMode: phone.coexistence ? 'COEXISTENCE' as const : 'NEW_WABA_NUMBER' as const,
        metadata: { onboarding: 'MANUAL', phoneNumberId: phone.id, wabaId: phone.wabaId, appId: dto.appId,
          appSecretEnc: this.credentials.seal(dto.appSecret), pendingAccessTokenEnc: this.credentials.seal(dto.accessToken),
          verifyTokenEnc: this.credentials.seal(verifyToken) } };
      return existing ? tx.channel.update({ where: { id: existing.id, tenantId: user.tenantId }, data })
        : tx.channel.create({ data: { ...data, tenantId: user.tenantId, type: 'WHATSAPP' } });
    });
    return { channel: this.publicChannel(channel), webhook: this.setup(channel.id, channel.metadata as Record<string, unknown>) };
  }

  async getSetup(user: AuthUserPayload, channelId: string) {
    this.manager(user);
    const channel = await this.ownedChannel(user.tenantId, channelId);
    return this.setup(channel.id, channel.metadata as Record<string, unknown>);
  }

  async activate(user: AuthUserPayload, channelId: string) {
    this.manager(user);
    const channel = await this.ownedChannel(user.tenantId, channelId);
    const stored = channel.metadata as Record<string, unknown>;
    if (!stored.webhookVerifiedAt) throw new BadRequestException('Guarda y verifica la URL y el token del webhook en tu app de Meta antes de activar.');
    if (this.activating(stored)) throw new ConflictException('La activación está en curso. Espera unos minutos y actualiza el diagnóstico.');
    const attempt = randomBytes(16).toString('hex');
    const claimed = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wa:tenant:${user.tenantId}`}, 0))`;
      return tx.channel.updateMany({ where: { id: channel.id, tenantId: user.tenantId, updatedAt: channel.updatedAt },
        data: { healthStatus: 'PENDING', metadata: { ...stored, activationId: attempt, activationStartedAt: new Date().toISOString() } } });
    });
    if (claimed.count !== 1) throw new ConflictException('La conexión cambió. Actualiza el estado antes de continuar.');
    const where = { id: channel.id, tenantId: user.tenantId, healthStatus: 'PENDING' as const, metadata: { path: ['activationId'], equals: attempt } };
    let subscriptionManaged = stored.subscriptionManaged === true;
    try {
      const client = this.client(stored);
      const token = this.accessToken(stored);
      const phone = await client.ownPhone(token, String(stored.wabaId), String(stored.phoneNumberId));
      if (!phone.registered) throw new BadRequestException('El número no está activo en WhatsApp Cloud API. Revisa su configuración en Meta.');
      if (!(await client.webhookConfigured(this.callbackUrl(channel.id)))) throw new BadRequestException('Configura esta URL en el webhook de tu app de Meta y suscribe el campo «messages».');
      subscriptionManaged = true;
      const prepared = await this.prisma.channel.updateMany({ where, data: { metadata: { ...stored, activationId: attempt, activationStartedAt: new Date().toISOString(), subscriptionManaged: true } } });
      if (prepared.count !== 1) throw new ConflictException('La conexión cambió. Actualiza su estado.');
      await client.subscribe(phone.wabaId, token);
      if (!(await client.subscribed(phone.wabaId, token))) throw new BadRequestException('Meta no confirmó la suscripción de tu app. Reintenta la activación.');
      const active = await this.prisma.channel.updateMany({ where, data: { healthStatus: 'CONNECTED', metadata: {
        ...stored, accessToken: this.credentials.seal(token), pendingAccessTokenEnc: null, subscriptionManaged: true,
      } } });
      if (active.count !== 1) throw new ConflictException('La conexión cambió. Actualiza su estado.');
      return { channel: this.publicChannel(await this.ownedChannel(user.tenantId, channel.id)) };
    } catch (error) {
      await this.prisma.channel.updateMany({ where, data: { healthStatus: 'DEGRADED', metadata: { ...stored as Prisma.InputJsonObject, subscriptionManaged } } });
      throw error;
    }
  }

  async diagnostics(user: AuthUserPayload, channelId: string) {
    const channel = await this.ownedChannel(user.tenantId, channelId);
    const stored = channel.metadata as Record<string, unknown>;
    const checks: Array<{ id: string; label: string; status: 'ok' | 'warn' | 'error'; detail: string }> = [];
    const nextSteps: string[] = [];
    if (this.activating(stored)) return { connected: false, healthStatus: channel.healthStatus, channel: this.publicChannel(channel),
      checks: [{ id: 'activation', label: 'Activación', status: 'warn' as const, detail: 'La activación está en curso.' }], nextSteps: ['Espera unos minutos y actualiza el diagnóstico.'] };
    let healthy = false;
    let unavailable = false;
    try {
      const client = this.client(stored);
      const token = this.accessToken(stored);
      const phone = await client.ownPhone(token, String(stored.wabaId), String(stored.phoneNumberId));
      const callback = Boolean(stored.webhookVerifiedAt && await client.webhookConfigured(this.callbackUrl(channel.id)));
      const subscribed = await client.subscribed(String(stored.wabaId), token);
      checks.push({ id: 'authorization', label: 'Permisos y número', status: phone.registered ? 'ok' : 'error', detail: phone.registered ? 'Meta confirma el acceso al número activo del negocio.' : 'Activa el número en WhatsApp Cloud API.' });
      checks.push({ id: 'webhook', label: 'Webhook de tu app', status: callback ? 'ok' : 'warn', detail: callback ? 'Meta confirma la URL y el campo messages de tu app.' : 'Guarda y verifica los datos del webhook en tu app de Meta.' });
      checks.push({ id: 'subscription', label: 'Suscripción de la cuenta', status: subscribed ? 'ok' : 'warn', detail: subscribed ? 'Tu app está suscrita a la cuenta de WhatsApp.' : 'Pulsa «Verificar y activar» después de configurar el webhook.' });
      // Diagnosis never activates credentials that are still pending.
      healthy = Boolean(phone.registered && callback && subscribed && stored.accessToken);
    } catch (error) {
      unavailable = error instanceof ServiceUnavailableException;
      checks.push({ id: 'authorization', label: 'Comprobación con Meta', status: unavailable ? 'warn' : 'error', detail: unavailable ? 'Meta no respondió. Intenta actualizar el diagnóstico más tarde.' : 'Revisa los permisos y las credenciales de tu app de Meta.' });
    }
    const healthStatus = healthy ? 'CONNECTED' as const : stored.accessToken ? 'DEGRADED' as const : 'PENDING' as const;
    if (!unavailable) await this.prisma.channel.updateMany({ where: { id: channel.id, tenantId: user.tenantId, updatedAt: channel.updatedAt }, data: { healthStatus } });
    const current = await this.ownedChannel(user.tenantId, channel.id).catch(() => null);
    if (healthy) nextSteps.push('Envía un mensaje desde otro teléfono y comprueba su recepción en Mensajes.');
    else nextSteps.push('Configura el webhook y pulsa «Verificar y activar», o desconecta para renovar las credenciales.');
    return { connected: healthy && current?.healthStatus === 'CONNECTED', healthStatus: current?.healthStatus || 'DISCONNECTED' as const,
      channel: current ? this.publicChannel(current) : undefined, checks, nextSteps };
  }

  async disconnect(user: AuthUserPayload, channelId: string) {
    this.manager(user);
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wa:tenant:${user.tenantId}`}, 0))`;
      const channel = await tx.channel.findFirst({ where: { id: channelId, tenantId: user.tenantId, type: 'WHATSAPP', healthStatus: { not: 'DISCONNECTED' }, metadata: { path: ['onboarding'], equals: 'MANUAL' } } });
      if (!channel) throw new NotFoundException('No encontramos esta conexión con credenciales propias.');
      const stored = channel.metadata as Record<string, unknown>;
      if (this.activating(stored)) throw new ConflictException('Espera a que termine la activación antes de desconectar.');
      if (stored.subscriptionManaged === true) {
        const client = this.client(stored);
        const token = this.accessToken(stored);
        try { if (await client.subscribed(String(stored.wabaId), token)) await client.unsubscribe(String(stored.wabaId), token); }
        catch (error) { if (!(error instanceof MetaAuthorizationExpiredException)) throw error; }
      }
      await tx.channel.updateMany({ where: { id: channel.id, tenantId: user.tenantId }, data: { healthStatus: 'DISCONNECTED', metadata: { phoneNumberId: channel.externalId, onboarding: 'MANUAL' } } });
      return { disconnected: true };
    }, { timeout: 45000 });
  }

  async verifyWebhook(channelId: string, mode: string, token: string, challenge: string) {
    const channel = await this.webhookChannel(channelId);
    const stored = channel.metadata as Record<string, unknown>;
    const expected = this.credentials.open(String(stored.verifyTokenEnc));
    if (mode !== 'subscribe' || typeof token !== 'string' || !timingSafeEqual(digest(expected), digest(token)) || typeof challenge !== 'string' || challenge.length > 4096) throw new UnauthorizedException('Webhook verification failed');
    await this.prisma.channel.updateMany({ where: { id: channel.id, tenantId: channel.tenantId, updatedAt: channel.updatedAt }, data: { metadata: { ...stored, webhookVerifiedAt: new Date().toISOString() } } });
    return challenge;
  }

  async receiveWebhook(channelId: string, rawBody: Buffer | undefined, signature: string | undefined, body: Parameters<ChannelsService['handleMetaWebhook']>[0]) {
    const channel = await this.webhookChannel(channelId);
    const stored = channel.metadata as Record<string, unknown>;
    const secret = this.credentials.open(String(stored.appSecretEnc));
    if (!rawBody || !signature || !/^sha256=[a-fA-F0-9]{64}$/.test(signature) || !timingSafeEqual(createHmac('sha256', secret).update(rawBody).digest(), Buffer.from(signature.slice(7), 'hex'))) throw new UnauthorizedException('Invalid Meta signature');
    if (!stored.accessToken || !['CONNECTED', 'DEGRADED'].includes(channel.healthStatus)) return { processed: 0, results: [] };
    return this.channels.handleMetaWebhook(body, { tenantId: channel.tenantId, channelId: channel.id, phoneNumberId: String(stored.phoneNumberId), wabaId: String(stored.wabaId) });
  }

  private manager(user: AuthUserPayload) { assertManager(user, 'Solo el dueño o un administrador puede gestionar WhatsApp.'); }
  private activating(stored: Record<string, unknown>) { return typeof stored.activationStartedAt === 'string' && new Date(stored.activationStartedAt).getTime() > Date.now() - 120000; }
  private client(stored: Record<string, unknown>) { return this.meta.forApp(String(stored.appId), this.credentials.open(String(stored.appSecretEnc))); }
  private accessToken(stored: Record<string, unknown>) { return this.credentials.open(String(stored.accessToken || stored.pendingAccessTokenEnc)); }
  private callbackUrl(id: string) { return `${(this.config.get<string>('PUBLIC_API_BASE_URL') || '').replace(/\/$/, '')}/webhooks/meta/whatsapp/manual/${id}`; }
  private setup(id: string, stored: Record<string, unknown>) { return { callbackUrl: this.callbackUrl(id), verifyToken: this.credentials.open(String(stored.verifyTokenEnc)), verified: Boolean(stored.webhookVerifiedAt) }; }
  private publicChannel(channel: Pick<Channel, 'metadata' | 'id' | 'type' | 'connectionMode' | 'healthStatus' | 'externalId' | 'displayName' | 'lastActiveAt'>) {
    return { id: channel.id, type: channel.type, connectionMode: channel.connectionMode, healthStatus: channel.healthStatus, externalId: channel.externalId, displayName: channel.displayName, lastActiveAt: channel.lastActiveAt, metadata: publicWhatsAppMetadata(channel.metadata) };
  }
  private async ownedChannel(tenantId: string, id: string) {
    const channel = await this.prisma.channel.findFirst({ where: { id, tenantId, type: 'WHATSAPP', healthStatus: { not: 'DISCONNECTED' }, metadata: { path: ['onboarding'], equals: 'MANUAL' } } });
    if (!channel) throw new NotFoundException('No encontramos esta conexión con credenciales propias.');
    return channel;
  }
  private async webhookChannel(id: string) {
    const channel = await this.prisma.channel.findFirst({ where: { id, type: 'WHATSAPP', healthStatus: { not: 'DISCONNECTED' }, metadata: { path: ['onboarding'], equals: 'MANUAL' } } });
    if (!channel) throw new UnauthorizedException('Webhook connection unavailable');
    return channel;
  }
}
