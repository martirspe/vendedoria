import { BadRequestException, ConflictException, ForbiddenException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { ChannelCredentialsService } from '../src/channels/channel-credentials.service';
import { ChannelsService } from '../src/channels/channels.service';
import { WhatsAppManualService } from '../src/channels/whatsapp-manual.service';
import { WhatsAppSignupService } from '../src/channels/whatsapp-signup.service';
import { MetaAuthorizationExpiredException, MetaSignupClient } from '../src/channels/meta-signup.client';
import { MetaWhatsAppClient } from '../src/channels/meta-whatsapp.client';
import { MetaInstagramClient } from '../src/channels/meta-instagram.client';
import { ConversationsService } from '../src/conversations/conversations.service';
import type { AuthUserPayload } from '../src/common/types/auth-user';

const isolated = process.env.DATABASE_URL?.includes('/vendedoria_test?') === true;
(isolated ? describe : describe.skip)('WhatsApp customer-owned app lifecycle and signed routing (isolated DB)', () => {
  const prisma = new PrismaService();
  // No platform Meta configuration: customer-owned apps work independently.
  const config = new ConfigService({ CHANNEL_CREDENTIALS_KEY: 'ab'.repeat(32), PUBLIC_API_BASE_URL: 'https://example.test/api/v1', NODE_ENV: 'production' });
  const credentials = new ChannelCredentialsService(config);
  const ingress = jest.fn().mockResolvedValue({ accepted: true });
  const channels = new ChannelsService(prisma, config, { ingestInboundWhatsApp: ingress } as unknown as ConversationsService, {} as MetaWhatsAppClient, {} as MetaInstagramClient);
  const customer = { ownPhone: jest.fn(), webhookConfigured: jest.fn(), subscribe: jest.fn(), subscribed: jest.fn(), unsubscribe: jest.fn() };
  const meta = { appId: '123456', version: 'v26.0', forApp: jest.fn(() => customer), authorizedPhones: jest.fn(), subscribe: jest.fn(), subscribed: jest.fn() };
  const manual = new WhatsAppManualService(prisma, config, credentials, meta as unknown as MetaSignupClient, channels);
  const signup = new WhatsAppSignupService(prisma, config, credentials, meta as unknown as MetaSignupClient, {} as MetaWhatsAppClient, manual);
  let users: AuthUserPayload[] = [];
  let dto = { appId: '777777', appSecret: 'cd'.repeat(16), accessToken: 'synthetic-customer-system-token', wabaId: '654321', phoneNumberId: '111111' };
  const phone = () => ({ id: dto.phoneNumberId, wabaId: dto.wabaId, displayName: 'Synthetic business', displayPhoneNumber: '', registered: true, coexistence: false });
  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    const run = randomBytes(6).toString('hex');
    const tenants = await Promise.all(['a', 'b'].map(suffix => prisma.tenant.create({ data: { name: 'Synthetic test', slug: `wa-manual-${run}-${suffix}` } })));
    users = tenants.map(tenant => ({ tenantId: tenant.id, userId: `user-${tenant.id}`, membershipRole: 'OWNER', email: 'synthetic@example.test' }));
    const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    dto = { ...dto, appId: `${id}1`, wabaId: `${id}2`, phoneNumberId: `${id}3` };
    customer.ownPhone.mockImplementation(async () => phone()); customer.webhookConfigured.mockResolvedValue(true);
    customer.subscribe.mockResolvedValue(undefined); customer.subscribed.mockResolvedValue(true); customer.unsubscribe.mockResolvedValue(undefined);
    meta.authorizedPhones.mockImplementation(async () => [phone()]);
  });
  afterEach(async () => { await prisma.tenant.deleteMany({ where: { id: { in: users.map(user => user.tenantId) } } }); jest.clearAllMocks(); });
  const setup = async () => {
    const result = await manual.connect(users[0], dto);
    await manual.verifyWebhook(result.channel.id, 'subscribe', result.webhook.verifyToken, 'synthetic-challenge');
    return result;
  };
  const payload = (wabaId = dto.wabaId, phoneNumberId = dto.phoneNumberId) => ({ entry: [{ id: wabaId, changes: [{ field: 'messages', value: { metadata: { phone_number_id: phoneNumberId }, messages: [{ id: 'synthetic-message', from: '51000000000', type: 'text', text: { body: 'Synthetic' } }] } }] }] });
  const signature = (raw: Buffer, secret = dto.appSecret) => `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

  it('exposes manual availability without platform approval configuration, encrypts secrets and restricts setup to managers of the business', async () => {
    expect(signup.configuration(users[0])).toMatchObject({ available: false, manualAvailable: true });
    const result = await manual.connect(users[0], dto);
    expect(result.channel.healthStatus).toBe('PENDING');
    expect(result.channel.metadata).toMatchObject({ onboarding: 'MANUAL', hasAccessToken: false });
    const stored = (await prisma.channel.findFirstOrThrow({ where: { tenantId: users[0].tenantId } })).metadata as Record<string, unknown>;
    for (const secret of [dto.appSecret, dto.accessToken, result.webhook.verifyToken]) expect(JSON.stringify(stored)).not.toContain(secret);
    expect(stored.accessToken).toBeUndefined();
    expect(JSON.stringify(await channels.list(users[0].tenantId))).not.toMatch(/appSecret|verifyToken|pendingAccessToken/);
    await expect(manual.getSetup(users[1], result.channel.id)).rejects.toThrow();
    await expect(manual.getSetup({ ...users[0], membershipRole: 'AGENT' }, result.channel.id)).rejects.toThrow(ForbiddenException);
    await expect(manual.connect({ ...users[0], membershipRole: 'AGENT' }, dto)).rejects.toThrow(ForbiddenException);
    expect(await manual.getSetup(users[0], result.channel.id)).toEqual(result.webhook);
  });
  it('rejects platform app credentials, inactive numbers and failed authorization without touching an existing channel', async () => {
    await expect(manual.connect(users[0], { ...dto, appId: '123456' })).rejects.toThrow(BadRequestException);
    customer.ownPhone.mockResolvedValueOnce({ ...phone(), registered: false });
    await expect(manual.connect(users[0], dto)).rejects.toThrow(BadRequestException);
    customer.ownPhone.mockRejectedValueOnce(new BadRequestException('Not authorized'));
    await expect(manual.connect(users[0], dto)).rejects.toThrow(BadRequestException);
    expect(await prisma.channel.count({ where: { tenantId: users[0].tenantId } })).toBe(0);
  });
  it('requires both webhook challenge verification and exact Meta configuration before exposing send credentials', async () => {
    const result = await manual.connect(users[0], dto);
    await expect(manual.verifyWebhook(result.channel.id, 'subscribe', 'wrong-token', 'challenge')).rejects.toThrow(UnauthorizedException);
    await expect(manual.activate(users[0], result.channel.id)).rejects.toThrow(BadRequestException);
    await manual.verifyWebhook(result.channel.id, 'subscribe', result.webhook.verifyToken, 'challenge');
    customer.webhookConfigured.mockResolvedValueOnce(false);
    await expect(manual.activate(users[0], result.channel.id)).rejects.toThrow(BadRequestException);
    expect(customer.subscribe).not.toHaveBeenCalled();
    expect((await prisma.channel.findFirstOrThrow({ where: { id: result.channel.id } })).metadata).not.toHaveProperty('accessToken');
    const connected = await manual.activate(users[0], result.channel.id);
    expect(connected.channel.healthStatus).toBe('CONNECTED');
    expect(customer.webhookConfigured).toHaveBeenCalledWith(result.webhook.callbackUrl);
    expect(customer.subscribe).toHaveBeenCalledWith(dto.wabaId, dto.accessToken);
    expect((await signup.diagnostics(users[0])).connected).toBe(true);
    expect(JSON.stringify(connected)).not.toContain(dto.accessToken);
  });
  it('rejects unsigned/tampered events, ignores pending connections and scopes every signed delivery to its WABA and phone', async () => {
    const result = await setup(); const body = payload(); const raw = Buffer.from(JSON.stringify(body));
    await expect(manual.receiveWebhook(result.channel.id, raw, undefined, body)).rejects.toThrow(UnauthorizedException);
    await expect(manual.receiveWebhook(result.channel.id, raw, signature(raw, 'ef'.repeat(16)), body)).rejects.toThrow(UnauthorizedException);
    expect(await manual.receiveWebhook(result.channel.id, raw, signature(raw), body)).toMatchObject({ processed: 0 });
    expect(ingress).not.toHaveBeenCalled();
    await manual.activate(users[0], result.channel.id);
    for (const unrelated of [payload('999999'), payload(dto.wabaId, '999999')]) {
      const bytes = Buffer.from(JSON.stringify(unrelated));
      expect(await manual.receiveWebhook(result.channel.id, bytes, signature(bytes), unrelated)).toMatchObject({ processed: 0 });
    }
    await manual.receiveWebhook(result.channel.id, raw, signature(raw), body);
    expect(ingress).toHaveBeenCalledTimes(1);
    expect(ingress).toHaveBeenCalledWith(expect.objectContaining({ tenantId: users[0].tenantId, channelId: result.channel.id, phoneNumberId: dto.phoneNumberId }));
    const tampered = Buffer.from(JSON.stringify(payload(dto.wabaId, '999999')));
    await expect(manual.receiveWebhook(result.channel.id, tampered, signature(raw), body)).rejects.toThrow(UnauthorizedException);
  });
  it('prevents the shared platform webhook or a mismatched tenant scope from ingesting a manual connection', async () => {
    const result = await setup(); await manual.activate(users[0], result.channel.id);
    const capture = jest.fn();
    const context = { prisma, logger: { warn: jest.fn() }, ingestInbound: capture } as unknown as ConversationsService;
    const message = { phoneNumberId: dto.phoneNumberId, fromPhone: '51000000000', text: 'Synthetic' };
    await ConversationsService.prototype.ingestInboundWhatsApp.call(context, message);
    await ConversationsService.prototype.ingestInboundWhatsApp.call(context, { ...message, channelId: result.channel.id, tenantId: users[1].tenantId });
    expect(capture).not.toHaveBeenCalled();
  });
  it('serializes competing claims and prevents switching either mode without disconnecting', async () => {
    const results = await Promise.allSettled(users.map(user => manual.connect(user, dto)));
    expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(item => item.status === 'rejected')).toMatchObject({ reason: expect.any(ConflictException) });
    const winner = results[0].status === 'fulfilled' ? users[0] : users[1];
    await expect(manual.connect(winner, dto)).rejects.toThrow(ConflictException);
    const state = randomBytes(32).toString('base64url');
    const session = await prisma.whatsAppSignupSession.create({ data: { tenantId: winner.tenantId, userId: winner.userId, stateHash: createHash('sha256').update(state).digest('hex'), expiresAt: new Date(Date.now() + 600000), status: 'AUTHORIZED', accessTokenEnc: credentials.seal(dto.accessToken) } });
    await expect(signup.complete(winner, { sessionId: session.id, state, phoneNumberId: dto.phoneNumberId, wabaId: dto.wabaId })).rejects.toThrow(ConflictException);
  });
  it('keeps partial subscription failures recoverable, blocks duplicate activation and disconnects revoked credentials', async () => {
    const result = await setup();
    let fail!: (error: Error) => void;
    let entered!: () => void;
    const subscribeEntered = new Promise<void>(resolve => { entered = resolve; });
    customer.subscribe.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; entered(); }));
    const pending = manual.activate(users[0], result.channel.id);
    await subscribeEntered;
    await expect(manual.activate(users[0], result.channel.id)).rejects.toThrow(ConflictException);
    await expect(manual.disconnect(users[0], result.channel.id)).rejects.toThrow(ConflictException);
    fail(new ServiceUnavailableException('Meta unavailable')); await expect(pending).rejects.toThrow(ServiceUnavailableException);
    expect((await prisma.channel.findFirstOrThrow({ where: { id: result.channel.id } })).metadata).not.toHaveProperty('accessToken');
    await manual.activate(users[0], result.channel.id);
    customer.subscribed.mockRejectedValueOnce(new MetaAuthorizationExpiredException());
    await signup.disconnect(users[0], result.channel.id);
    expect((await signup.diagnostics(users[0])).healthStatus).toBe('DISCONNECTED');
    await expect(manual.getSetup(users[0], result.channel.id)).rejects.toThrow();
    await expect(manual.receiveWebhook(result.channel.id, Buffer.from('{}'), signature(Buffer.from('{}')), {})).rejects.toThrow(UnauthorizedException);
    expect((await manual.connect(users[1], dto)).channel.healthStatus).toBe('PENDING');
  });
  it('cancels abandoned setup locally without disturbing pre-existing app subscriptions', async () => {
    const result = await manual.connect(users[0], dto);
    await signup.disconnect(users[0], result.channel.id);
    expect(customer.unsubscribe).not.toHaveBeenCalled();
    expect((await prisma.channel.findFirstOrThrow({ where: { id: result.channel.id } })).metadata).toEqual({ phoneNumberId: dto.phoneNumberId, onboarding: 'MANUAL' });
  });
  it('preserves an active connection during transient Meta failures and never lets slow diagnostics resurrect a disconnect', async () => {
    const result = await setup(); await manual.activate(users[0], result.channel.id);
    customer.ownPhone.mockRejectedValueOnce(new ServiceUnavailableException('Unavailable'));
    expect((await signup.diagnostics(users[0])).healthStatus).toBe('CONNECTED');
    let finish!: (value: ReturnType<typeof phone>) => void;
    let entered!: () => void;
    const checking = new Promise<void>(resolve => { entered = resolve; });
    customer.ownPhone.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; entered(); }));
    const diagnostic = signup.diagnostics(users[0]); await checking;
    await signup.disconnect(users[0], result.channel.id); finish(phone());
    expect((await diagnostic).connected).toBe(false);
    expect((await prisma.channel.findFirstOrThrow({ where: { id: result.channel.id } })).healthStatus).toBe('DISCONNECTED');
  });
});
