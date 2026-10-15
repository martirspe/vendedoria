import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { WhatsAppSignupService } from '../src/channels/whatsapp-signup.service';
import { ChannelCredentialsService } from '../src/channels/channel-credentials.service';
import { MetaAuthorizationExpiredException, MetaSignupClient } from '../src/channels/meta-signup.client';
import { MetaWhatsAppClient } from '../src/channels/meta-whatsapp.client';
import type { AuthUserPayload } from '../src/common/types/auth-user';

// Run only with npm run test:docker; never fall back to the development database.
const isolated = process.env.DATABASE_URL?.includes('/vendedoria_test?') === true;
(isolated ? describe : describe.skip)('WhatsApp tenant authorization and concurrent claims (isolated DB)', () => {
  const prisma = new PrismaService();
  const env = { META_APP_ID: '123456', META_WHATSAPP_CONFIG_ID: '234567', META_APP_SECRET: 'synthetic-secret', META_VERIFY_TOKEN: 'synthetic-verify', PUBLIC_API_BASE_URL: 'https://example.test/api/v1', CHANNEL_CREDENTIALS_KEY: 'ab'.repeat(32) };
  const config = { get: (key: string) => env[key as keyof typeof env] } as unknown as ConfigService;
  const credentials = new ChannelCredentialsService(config);
  const meta = { appId: '123456', version: 'v26.0', exchange: jest.fn(), authorizedPhones: jest.fn(), register: jest.fn(), subscribe: jest.fn(), subscribed: jest.fn(), unsubscribe: jest.fn() };
  const service = new WhatsAppSignupService(prisma, config, credentials, meta as unknown as MetaSignupClient, {} as MetaWhatsAppClient);
  let users: AuthUserPayload[] = [];
  let phone = { id: '111111', wabaId: '654321', displayName: 'Synthetic business', displayPhoneNumber: '', coexistence: false, registered: false };

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    const run = randomBytes(6).toString('hex');
    const tenants = await Promise.all(['a', 'b'].map(suffix => prisma.tenant.create({ data: { name: 'Synthetic test', slug: `wa-${run}-${suffix}` } })));
    users = tenants.map(tenant => ({ tenantId: tenant.id, userId: `user-${tenant.id}`, membershipRole: 'OWNER', email: 'synthetic@example.test' }));
    phone = { ...phone, id: `${Date.now()}${Math.floor(Math.random() * 1000)}`, wabaId: `${Date.now()}${Math.floor(Math.random() * 1000)}`, coexistence: false, registered: false };
    meta.exchange.mockResolvedValue('synthetic-customer-token');
    meta.authorizedPhones.mockImplementation(async () => [{ ...phone }]);
    meta.register.mockImplementation(async () => { phone.registered = true; });
    meta.subscribe.mockResolvedValue(undefined); meta.subscribed.mockResolvedValue(true); meta.unsubscribe.mockResolvedValue(undefined);
  });
  afterEach(async () => { await prisma.tenant.deleteMany({ where: { id: { in: users.map(user => user.tenantId) } } }); jest.clearAllMocks(); });
  const authorized = async (user: AuthUserPayload) => {
    const session = await service.start(user);
    await service.authorize(user, { ...session, code: 'synthetic-code' }); return session;
  };
  it('binds authorization to tenant, user, state and expiry, and consumes each code once', async () => {
    const session = await service.start(users[0]);
    await expect(service.authorize(users[1], { ...session, code: 'synthetic-code' })).rejects.toThrow(BadRequestException);
    await expect(service.authorize({ ...users[0], userId: 'other-user' }, { ...session, code: 'synthetic-code' })).rejects.toThrow(BadRequestException);
    await expect(service.authorize(users[0], { ...session, state: 'wrong-state', code: 'synthetic-code' })).rejects.toThrow(BadRequestException);
    expect(meta.exchange).not.toHaveBeenCalled();
    await service.authorize(users[0], { ...session, code: 'synthetic-code' });
    await expect(service.authorize(users[0], { ...session, code: 'replay' })).rejects.toThrow(BadRequestException);
    const expired = await service.start(users[0]);
    await prisma.whatsAppSignupSession.update({ where: { id: expired.sessionId }, data: { expiresAt: new Date(0) } });
    await expect(service.authorize(users[0], { ...expired, code: 'expired' })).rejects.toThrow(BadRequestException);
  });
  it('rejects agent management and an ungranted phone without reserving a channel', async () => {
    await expect(service.start({ ...users[0], membershipRole: 'AGENT' })).rejects.toThrow(ForbiddenException);
    const session = await authorized(users[0]);
    await expect(service.complete(users[0], { ...session, phoneNumberId: '999999', wabaId: phone.wabaId, pin: '123456' })).rejects.toThrow(BadRequestException);
    expect(await prisma.channel.count({ where: { tenantId: users[0].tenantId } })).toBe(0);
  });
  it('registers and subscribes, encrypts credentials and returns an idempotent safe result', async () => {
    const session = await authorized(users[0]);
    const dto = { ...session, phoneNumberId: phone.id, wabaId: phone.wabaId, pin: '123456' };
    const first = await service.complete(users[0], dto);
    expect(first.channel.healthStatus).toBe('CONNECTED');
    expect(await service.complete(users[0], dto)).toEqual(first);
    expect(meta.register).toHaveBeenCalledTimes(1);
    const channel = await prisma.channel.findFirstOrThrow({ where: { tenantId: users[0].tenantId } });
    expect(JSON.stringify(channel.metadata)).not.toContain('synthetic-customer-token');
    expect(JSON.stringify(first)).not.toMatch(/accessToken|registrationPin|state/);
    expect((await prisma.whatsAppSignupSession.findFirstOrThrow({ where: { tenantId: users[0].tenantId } })).accessTokenEnc).toBeNull();
  });
  it('serializes simultaneous claims from different businesses', async () => {
    const sessions = await Promise.all(users.map(authorized));
    const result = await Promise.allSettled(users.map((user, index) => service.complete(user, { ...sessions[index], phoneNumberId: phone.id, wabaId: phone.wabaId, pin: '123456' })));
    expect(result.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(result.find(item => item.status === 'rejected')).toMatchObject({ reason: expect.any(ConflictException) });
    expect(await prisma.channel.count({ where: { externalId: phone.id } })).toBe(1);
  });
  it('does not register coexistence numbers and clears credentials on disconnect without resurrection', async () => {
    phone.coexistence = true; phone.registered = true;
    const session = await authorized(users[0]);
    const result = await service.complete(users[0], { ...session, phoneNumberId: phone.id, wabaId: phone.wabaId });
    expect(meta.register).not.toHaveBeenCalled(); expect(result.channel.connectionMode).toBe('COEXISTENCE');
    await service.disconnect(users[0], result.channel.id);
    expect(meta.unsubscribe).toHaveBeenCalledWith(phone.wabaId, 'synthetic-customer-token');
    const diagnostics = await service.diagnostics(users[0]);
    expect(diagnostics.connected).toBe(false); expect(diagnostics.healthStatus).toBe('DISCONNECTED');
    expect(JSON.stringify((await prisma.channel.findFirstOrThrow({ where: { tenantId: users[0].tenantId } })).metadata)).not.toMatch(/accessToken|registrationPin/);
  });
  it('retains no send credential after a subscription failure and allows a fresh attempt', async () => {
    meta.subscribe.mockRejectedValueOnce(new ServiceUnavailableException('Meta unavailable'));
    const session = await authorized(users[0]);
    await expect(service.complete(users[0], { ...session, phoneNumberId: phone.id, wabaId: phone.wabaId, pin: '123456' })).rejects.toThrow(ServiceUnavailableException);
    const channel = await prisma.channel.findFirstOrThrow({ where: { tenantId: users[0].tenantId } });
    expect(channel.healthStatus).toBe('DEGRADED'); expect((channel.metadata as Record<string, unknown>).accessToken).toBeUndefined();
    const retry = await authorized(users[0]);
    expect((await service.complete(users[0], { ...retry, phoneNumberId: phone.id, wabaId: phone.wabaId })).channel.healthStatus).toBe('CONNECTED');
  });
  it('allows local disconnect after revocation and permits a new authorized business to claim the released number', async () => {
    phone.registered = true;
    const session = await authorized(users[0]);
    const result = await service.complete(users[0], { ...session, phoneNumberId: phone.id, wabaId: phone.wabaId });
    meta.subscribed.mockRejectedValueOnce(new MetaAuthorizationExpiredException());
    await service.disconnect(users[0], result.channel.id);
    const next = await authorized(users[1]);
    expect((await service.complete(users[1], { ...next, phoneNumberId: phone.id, wabaId: phone.wabaId })).channel.healthStatus).toBe('CONNECTED');
  });
});
