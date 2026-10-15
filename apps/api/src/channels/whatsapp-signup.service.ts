import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthUserPayload } from '../common/types/auth-user';
import { assertManager } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelCredentialsService } from './channel-credentials.service';
import { MetaAuthorizationExpiredException, MetaSignupClient } from './meta-signup.client';
import { MetaWhatsAppClient } from './meta-whatsapp.client';
import { asWhatsAppMetadata, publicWhatsAppMetadata } from './whatsapp-metadata';
import { WhatsAppManualService } from './whatsapp-manual.service';
import type { CompleteWhatsAppSignupDto, WhatsAppSignupStateDto } from './dto/whatsapp-signup.dto';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class WhatsAppSignupService {
  constructor(
    private readonly prisma: PrismaService, private readonly config: ConfigService,
    private readonly credentials: ChannelCredentialsService, private readonly meta: MetaSignupClient,
    private readonly messenger: MetaWhatsAppClient,
    @Optional() private readonly manual?: WhatsAppManualService,
  ) {}

  configuration(user: AuthUserPayload) {
    const available = Boolean(this.meta.appId && this.config.get('META_WHATSAPP_CONFIG_ID') &&
      this.config.get('META_APP_SECRET') && this.config.get('META_VERIFY_TOKEN') && this.credentials.configured &&
      /^https:\/\//.test(this.config.get<string>('PUBLIC_API_BASE_URL') || ''));
    return { available, manualAvailable: this.manual?.available || false, canManage: ['OWNER', 'ADMIN'].includes(user.membershipRole),
      appId: available ? this.meta.appId : null, graphVersion: this.meta.version,
      message: available ? null : 'La conexión con Meta aún no está disponible. Contacta con soporte.' };
  }

  async start(user: AuthUserPayload) {
    this.manager(user);
    if (!this.configuration(user).available) throw new ServiceUnavailableException('La conexión con Meta aún no está disponible. Contacta con soporte.');
    // Remove expired credentials without touching another business's attempts.
    await this.prisma.whatsAppSignupSession.deleteMany({ where: { tenantId: user.tenantId, expiresAt: { lt: new Date() } } });
    const state = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const session = await this.prisma.whatsAppSignupSession.create({ data: {
      tenantId: user.tenantId, userId: user.userId, stateHash: hash(state), expiresAt,
    } });
    return { sessionId: session.id, state, expiresAt: expiresAt.toISOString(),
      configId: this.config.get<string>('META_WHATSAPP_CONFIG_ID')!, appId: this.meta.appId, graphVersion: this.meta.version };
  }

  async authorize(user: AuthUserPayload, dto: WhatsAppSignupStateDto & { code: string }) {
    this.manager(user);
    const where = this.sessionWhere(user, dto);
    const claimed = await this.prisma.whatsAppSignupSession.updateMany({ where: { ...where, status: 'CREATED' }, data: { status: 'EXCHANGING' } });
    if (claimed.count !== 1) throw new BadRequestException('Esta autorización ya se utilizó o venció. Vuelve a conectar WhatsApp.');
    try {
      // Exchange immediately: do not wait for the browser's separate session-info event.
      const token = await this.meta.exchange(dto.code);
      await this.prisma.whatsAppSignupSession.updateMany({ where: { ...where, status: 'EXCHANGING' }, data: { accessTokenEnc: this.credentials.seal(token), status: 'AUTHORIZED' } });
      const phones = await this.meta.authorizedPhones(token);
      if (!phones.length) throw new BadRequestException('La cuenta autorizada no tiene números disponibles. Completa el alta del número en Meta.');
      return { phones };
    } catch (error) {
      await this.prisma.whatsAppSignupSession.updateMany({ where, data: { status: 'FAILED', accessTokenEnc: null } });
      throw error;
    }
  }

  async complete(user: AuthUserPayload, dto: CompleteWhatsAppSignupDto) {
    this.manager(user);
    const where = this.sessionWhere(user, dto);
    const session = await this.prisma.whatsAppSignupSession.findFirst({ where });
    if (!session) throw new BadRequestException('La autorización venció. Vuelve a conectar WhatsApp.');
    if (session.status === 'COMPLETE' && session.channelId) {
      const saved = await this.prisma.channel.findFirst({ where: { id: session.channelId, tenantId: user.tenantId, externalId: dto.phoneNumberId, metadata: { path: ['signupSessionId'], equals: session.id } } });
      if (!saved) throw new ConflictException('Esta conexión cambió. Actualiza el estado.');
      return { channel: await this.publicChannel(user.tenantId, session.channelId) };
    }
    if (session.status !== 'AUTHORIZED' || !session.accessTokenEnc) throw new BadRequestException('Completa la autorización de Meta antes de continuar.');
    const token = this.credentials.open(session.accessTokenEnc);
    const phones = await this.meta.authorizedPhones(token);
    const phone = phones.find(item => item.id === dto.phoneNumberId && item.wabaId === dto.wabaId);
    if (!phone) throw new BadRequestException('Ese número no pertenece a la cuenta autorizada. Vuelve a conectar WhatsApp.');
    if (!phone.registered && !phone.coexistence && !dto.pin) throw new BadRequestException('Indica un PIN de seis dígitos para activar el número.');
    const claimed = await this.prisma.whatsAppSignupSession.updateMany({ where: { ...where, status: 'AUTHORIZED' }, data: { status: 'COMPLETING' } });
    if (claimed.count !== 1) throw new ConflictException('La conexión ya se está procesando. Actualiza el estado en unos minutos.');
    let channelId: string | undefined;
    try {
      const channel = await this.prisma.$transaction(async tx => {
        // Serialize claims across processes, including different phones of the same WABA.
        for (const key of [`wa:tenant:${user.tenantId}`, `wa:waba:${phone.wabaId}`, `wa:phone:${phone.id}`].sort()) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
        }
        const taken = await tx.channel.findFirst({ where: { type: 'WHATSAPP', tenantId: { not: user.tenantId }, healthStatus: { not: 'DISCONNECTED' }, OR: [
          { externalId: phone.id }, { metadata: { path: ['wabaId'], equals: phone.wabaId } },
        ] }, select: { id: true } });
        if (taken) throw new ConflictException('Esta cuenta o número ya está vinculado a otro negocio.');
        const existing = await tx.channel.findFirst({ where: { tenantId: user.tenantId, type: 'WHATSAPP' } });
        if (existing && existing.healthStatus !== 'DISCONNECTED' && (existing.metadata as Record<string, unknown> | null)?.onboarding === 'MANUAL') throw new ConflictException('Desconecta la conexión con credenciales propias antes de conectar con Meta.');
        if (existing?.healthStatus === 'PENDING' && existing.updatedAt.getTime() > Date.now() - 120000) throw new ConflictException('Ya hay una conexión en curso. Actualiza el diagnóstico antes de reintentar.');
        if (existing?.externalId && existing.externalId !== phone.id && existing.healthStatus !== 'DISCONNECTED') throw new ConflictException('Desconecta el número actual antes de conectar otro.');
        const data = { externalId: phone.id, displayName: phone.displayName,
          connectionMode: phone.coexistence ? 'COEXISTENCE' as const : 'NEW_WABA_NUMBER' as const,
          healthStatus: 'PENDING' as const, metadata: { phoneNumberId: phone.id, wabaId: phone.wabaId,
            onboarding: 'EMBEDDED_SIGNUP', pendingAccessTokenEnc: this.credentials.seal(token),
            signupSessionId: session.id, ...(dto.pin ? { registrationPinEnc: this.credentials.seal(dto.pin) } : {}),
          } };
        return existing ? tx.channel.update({ where: { id: existing.id, tenantId: user.tenantId }, data })
          : tx.channel.create({ data: { ...data, type: 'WHATSAPP', tenantId: user.tenantId } });
      });
      channelId = channel.id;
      if (!phone.registered && !phone.coexistence) await this.meta.register(phone.id, token, dto.pin!);
      await this.meta.subscribe(phone.wabaId, token);
      if (!(await this.meta.subscribed(phone.wabaId, token))) throw new BadRequestException('Meta no confirmó la recepción de mensajes. Vuelve a conectar WhatsApp.');
      const verified = (await this.meta.authorizedPhones(token)).find(item => item.id === phone.id && item.wabaId === phone.wabaId);
      if (!verified?.registered) throw new BadRequestException('El número aún no está activo en la API de WhatsApp. Completa su activación en Meta.');
      await this.prisma.$transaction(async tx => {
        const active = await tx.channel.updateMany({ where: { id: channel.id, tenantId: user.tenantId, healthStatus: 'PENDING', metadata: { path: ['signupSessionId'], equals: session.id } }, data: { healthStatus: 'CONNECTED', metadata: { ...(channel.metadata as Record<string, string>), accessToken: this.credentials.seal(token) } } });
        if (active.count !== 1) throw new ConflictException('La conexión cambió. Actualiza el estado y vuelve a intentarlo.');
        await tx.whatsAppSignupSession.updateMany({ where, data: { status: 'COMPLETE', channelId: channel.id, accessTokenEnc: null } });
      });
      return { channel: await this.publicChannel(user.tenantId, channel.id) };
    } catch (error) {
      if (channelId) await this.prisma.channel.updateMany({ where: { id: channelId, tenantId: user.tenantId, healthStatus: 'PENDING', metadata: { path: ['signupSessionId'], equals: session.id } }, data: { healthStatus: 'DEGRADED' } });
      await this.prisma.whatsAppSignupSession.updateMany({ where, data: { status: 'FAILED', accessTokenEnc: null } });
      throw error;
    }
  }

  async cancel(user: AuthUserPayload, dto: WhatsAppSignupStateDto) {
    this.manager(user);
    await this.prisma.whatsAppSignupSession.updateMany({ where: { ...this.sessionWhere(user, dto), status: { in: ['CREATED', 'AUTHORIZED', 'FAILED'] } }, data: { status: 'CANCELLED', accessTokenEnc: null } });
    return { cancelled: true };
  }

  async diagnostics(user: AuthUserPayload) {
    const channel = await this.prisma.channel.findFirst({ where: { tenantId: user.tenantId, type: 'WHATSAPP' } });
    const checks: Array<{ id: string; label: string; status: 'ok' | 'warn' | 'error'; detail: string }> = [];
    const nextSteps: string[] = [];
    if (!channel || channel.healthStatus === 'DISCONNECTED') return {
      connected: false, healthStatus: channel ? 'DISCONNECTED' : 'PENDING', channel: channel ? await this.publicChannel(user.tenantId, channel.id) : undefined,
      checks: [{ id: 'channel', label: 'Número de WhatsApp', status: 'warn', detail: 'No hay una conexión activa.' }],
      nextSteps: ['Elige conectar con Meta o configurar las credenciales de tu propia app.'],
    };
    if ((channel.metadata as Record<string, unknown> | null)?.onboarding === 'MANUAL' && this.manual) return this.manual.diagnostics(user, channel.id);
    if (channel.healthStatus === 'PENDING' && channel.updatedAt.getTime() > Date.now() - 120000) return {
      connected: false, healthStatus: 'PENDING', channel: await this.publicChannel(user.tenantId, channel.id),
      checks: [{ id: 'channel', label: 'Activación del número', status: 'warn', detail: 'La conexión con Meta está en curso.' }],
      nextSteps: ['Espera unos minutos y actualiza el diagnóstico.'],
    };
    const metadata = asWhatsAppMetadata(channel.metadata);
    const embedded = (channel.metadata as Record<string, unknown> | null)?.onboarding === 'EMBEDDED_SIGNUP';
    let healthy = false;
    let unavailable = false;
    try {
      if (metadata && embedded && metadata.wabaId) {
        const token = this.credentials.open(metadata.accessToken);
        const phone = (await this.meta.authorizedPhones(token)).find(item => item.id === channel.externalId && item.wabaId === metadata.wabaId);
        const subscribed = Boolean(phone && await this.meta.subscribed(metadata.wabaId, token));
        healthy = Boolean(phone?.registered && subscribed);
        checks.push({ id: 'authorization', label: 'Permisos del negocio', status: phone ? 'ok' : 'error', detail: phone ? 'Meta confirma el acceso al número de tu negocio.' : 'La autorización ya no permite acceder al número.' });
        checks.push({ id: 'subscription', label: 'Recepción de mensajes', status: subscribed ? 'ok' : 'error', detail: subscribed ? 'La cuenta está suscrita a VendedorIA.' : 'Vuelve a conectar WhatsApp para habilitar la recepción.' });
        checks.push({ id: 'registration', label: 'Número activo en la API', status: phone?.registered ? 'ok' : 'error', detail: phone?.registered ? 'Meta confirma la activación del número.' : 'Completa la activación del número en Meta.' });
      } else if (metadata) {
        healthy = (await this.messenger.verifyCredentials(metadata)).ok;
        checks.push({ id: 'authorization', label: 'Conexión existente', status: healthy ? 'ok' : 'error', detail: healthy ? 'Meta acepta la conexión existente.' : 'Vuelve a conectar WhatsApp para renovar la autorización.' });
      } else checks.push({ id: 'authorization', label: 'Autorización', status: 'error', detail: 'La conexión quedó incompleta. Vuelve a conectar WhatsApp.' });
    } catch (error) {
      unavailable = error instanceof ServiceUnavailableException;
      checks.push({ id: 'authorization', label: 'Comprobación con Meta', status: unavailable ? 'warn' : 'error', detail: unavailable ? 'No pudimos consultar Meta. Actualiza el diagnóstico en unos minutos.' : 'La autorización requiere atención. Vuelve a conectar WhatsApp.' });
    }
    const secure = Boolean(this.config.get('META_APP_SECRET') && this.config.get('META_VERIFY_TOKEN'));
    checks.push({ id: 'webhook', label: 'Recepción segura', status: secure ? 'ok' : 'error', detail: secure ? 'Los eventos se verifican con la firma de Meta.' : 'Contacta con soporte para habilitar la recepción segura.' });
    if (!secure) nextSteps.push('Contacta con soporte para completar la recepción de mensajes.');
    if (!healthy && !unavailable) nextSteps.push('Pulsa «Reconectar con Meta» y autoriza nuevamente tu cuenta.');
    if (unavailable) nextSteps.push('Actualiza el diagnóstico en unos minutos.');
    if (healthy && secure) nextSteps.push('Envía un mensaje desde otro teléfono y comprueba su recepción en Mensajes.');
    const healthStatus = healthy && secure ? 'CONNECTED' as const : 'DEGRADED' as const;
    // CAS prevents a slow diagnostic from resurrecting a disconnected/replaced account.
    if (!unavailable) await this.prisma.channel.updateMany({ where: { id: channel.id, tenantId: user.tenantId, updatedAt: channel.updatedAt }, data: { healthStatus } });
    const current = await this.publicChannel(user.tenantId, channel.id);
    return { connected: healthy && secure && current.healthStatus === 'CONNECTED', healthStatus: current.healthStatus,
      channel: current, checks, nextSteps };
  }

  async disconnect(user: AuthUserPayload, channelId: string) {
    this.manager(user);
    const current = await this.prisma.channel.findFirst({ where: { id: channelId, tenantId: user.tenantId, type: 'WHATSAPP' }, select: { metadata: true, healthStatus: true } });
    if (current?.healthStatus === 'DISCONNECTED') return { disconnected: true };
    if ((current?.metadata as Record<string, unknown> | null)?.onboarding === 'MANUAL' && this.manual) return this.manual.disconnect(user, channelId);
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wa:tenant:${user.tenantId}`}, 0))`;
      const channel = await tx.channel.findFirst({ where: { id: channelId, tenantId: user.tenantId, type: 'WHATSAPP' } });
      if (!channel) throw new NotFoundException('No encontramos esta conexión de WhatsApp.');
      if (channel.healthStatus === 'PENDING') throw new ConflictException('Espera a que termine la conexión antes de desconectarla.');
      const stored = channel.metadata as Record<string, unknown> | null;
      if (stored?.onboarding === 'MANUAL') throw new ConflictException('La modalidad de conexión cambió. Actualiza el estado y vuelve a desconectar.');
      const accessToken = stored?.accessToken || stored?.pendingAccessTokenEnc;
      if (typeof stored?.wabaId === 'string' && typeof accessToken === 'string' && stored.onboarding === 'EMBEDDED_SIGNUP') {
        // Check first so retries after an ambiguous unsubscribe remain safe.
        const token = this.credentials.open(accessToken);
        try {
          if (await this.meta.subscribed(stored.wabaId, token)) await this.meta.unsubscribe(stored.wabaId, token);
        } catch (error) {
          // Revoked/expired credentials must not trap a business in an unusable connection.
          // Clear the local association; late deliveries are ignored by channel status.
          if (!(error instanceof MetaAuthorizationExpiredException)) throw error;
        }
      }
      await tx.channel.updateMany({ where: { id: channel.id, tenantId: user.tenantId }, data: { healthStatus: 'DISCONNECTED', metadata: { phoneNumberId: channel.externalId } } });
      await tx.whatsAppSignupSession.updateMany({ where: { tenantId: user.tenantId }, data: { accessTokenEnc: null, status: 'CANCELLED' } });
      return { disconnected: true };
    }, { timeout: 45000 });
  }

  private manager(user: AuthUserPayload) { assertManager(user, 'Solo el dueño o un administrador puede gestionar WhatsApp.'); }
  private sessionWhere(user: AuthUserPayload, dto: WhatsAppSignupStateDto) {
    return { id: dto.sessionId, tenantId: user.tenantId, userId: user.userId, stateHash: hash(dto.state), expiresAt: { gt: new Date() } };
  }
  private async publicChannel(tenantId: string, id: string) {
    const channel = await this.prisma.channel.findFirst({ where: { id, tenantId }, select: {
      id: true, type: true, connectionMode: true, healthStatus: true, externalId: true, displayName: true, lastActiveAt: true, metadata: true,
    } });
    if (!channel) throw new NotFoundException('No encontramos la conexión. Actualiza el estado.');
    const { metadata, ...safe } = channel;
    return { ...safe, metadata: publicWhatsAppMetadata(metadata) };
  }
}
