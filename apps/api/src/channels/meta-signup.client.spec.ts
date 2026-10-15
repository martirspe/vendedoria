import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { MetaSignupClient } from './meta-signup.client';
import { ChannelCredentialsService } from './channel-credentials.service';
import { MetaWhatsAppClient } from './meta-whatsapp.client';
import { createHmac } from 'node:crypto';

const env = { META_APP_ID: '123456', META_APP_SECRET: 'synthetic-app-secret', CHANNEL_CREDENTIALS_KEY: 'ab'.repeat(32) };
const config = { get: (key: string) => env[key as keyof typeof env] } as unknown as ConfigService;
const token = 'synthetic-customer-token-with-permissions';
const info = { data: { is_valid: true, app_id: '123456', scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'], granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: ['654321'] }] } };
const respond = (value: unknown, ok = true, status = 200) => Promise.resolve({ ok, status, json: async () => value } as Response);

describe('Meta customer authorization', () => {
  let fetchMock: jest.SpyInstance;
  const meta = new MetaSignupClient(config);
  beforeEach(() => { fetchMock = jest.spyOn(global, 'fetch'); });
  afterEach(() => jest.restoreAllMocks());
  it('rejects another app, missing permissions and expired tokens before reading assets', async () => {
    for (const data of [{ ...info.data, app_id: 'other' }, { ...info.data, scopes: ['whatsapp_business_management'] }, { ...info.data, is_valid: false }, { ...info.data, expires_at: 1 }]) {
      fetchMock.mockImplementation(() => respond({ data }));
      await expect(meta.authorizedPhones(token)).rejects.toThrow(BadRequestException);
    }
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it('uses only granted WABA IDs, paginates by cursor, and distinguishes registration from platform assignment', async () => {
    fetchMock.mockImplementationOnce(() => respond(info))
      .mockImplementationOnce(() => respond({ data: [{ id: '111111', platform_type: 'CLOUD_API', status: 'PENDING' }], paging: { next: 'https://untrusted.example/', cursors: { after: 'cursor' } } }))
      .mockImplementationOnce(() => respond({ data: [{ id: '222222', platform_type: 'CLOUD_API', status: 'CONNECTED', is_on_biz_app: true }] }));
    const phones = await meta.authorizedPhones(token);
    expect(phones.map(phone => [phone.id, phone.registered, phone.coexistence])).toEqual([['111111', false, false], ['222222', true, true]]);
    const url = fetchMock.mock.calls[2][0] as URL;
    expect(url.hostname).toBe('graph.facebook.com'); expect(url.searchParams.get('after')).toBe('cursor');
    expect(url.pathname).toBe('/v26.0/654321/phone_numbers');
    expect(url.searchParams.has('appsecret_proof')).toBe(true);
  });
  it('exchanges codes in a server-only body and never returns Meta secret-bearing errors', async () => {
    fetchMock.mockImplementation(() => respond({ error: { message: 'synthetic-sensitive-value' } }, false, 400));
    await expect(meta.exchange('synthetic-code')).rejects.not.toThrow('synthetic-sensitive-value');
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.search).toBe('');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });
  it('decrypts customer tokens only at the send boundary, including ciphertext with placeholder-like text', async () => {
    const credentials = new ChannelCredentialsService(config);
    const sealed = credentials.seal(token);
    expect(sealed).not.toContain(token); expect(credentials.open(sealed)).toBe(token);
    expect(() => new ChannelCredentialsService({ get: () => 'cd'.repeat(32) } as unknown as ConfigService).open(sealed)).toThrow();
    fetchMock.mockImplementation(() => respond({ messages: [{ id: 'message-id' }] }));
    const client = new MetaWhatsAppClient(credentials);
    const sent = await client.sendTemplateMessage({ phoneNumberId: '111111', accessToken: sealed, toPhone: '51000000000', templateName: 'order_update', languageCode: 'es' });
    expect(sent).toEqual({ ok: true, messageId: 'message-id' });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${token}`);
  });
  it('validates customer-app tokens and WABA membership without requiring Embedded Signup granular grants', async () => {
    const own = meta.forApp('777777', 'cd'.repeat(16));
    fetchMock.mockImplementationOnce(() => respond({ data: { ...info.data, app_id: '777777', granular_scopes: undefined } }))
      .mockImplementationOnce(() => respond({ data: [{ id: '111111', platform_type: 'CLOUD_API', status: 'CONNECTED' }] }));
    expect((await own.ownPhone(token, '654321', '111111')).registered).toBe(true);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer 777777|${'cd'.repeat(16)}`);
    expect((fetchMock.mock.calls[1][0] as URL).searchParams.get('appsecret_proof')).toBe(createHmac('sha256', 'cd'.repeat(16)).update(token).digest('hex'));
    fetchMock.mockImplementation(() => respond(info));
    await expect(own.ownPhone(token, '654321', '111111')).rejects.toThrow(BadRequestException);
  });
  it('requires the exact active app callback and messages subscription', async () => {
    const callback = 'https://example.test/api/v1/webhooks/meta/whatsapp/manual/connection';
    const own = meta.forApp('777777', 'cd'.repeat(16));
    for (const subscription of [
      { object: 'whatsapp_business_account', callback_url: 'https://other.test/', active: true, fields: [{ name: 'messages' }] },
      { object: 'whatsapp_business_account', callback_url: callback, active: true, fields: [{ name: 'other' }] },
      { object: 'whatsapp_business_account', callback_url: callback, active: false, fields: [{ name: 'messages' }] },
    ]) {
      fetchMock.mockImplementation(() => respond({ data: [subscription] })); expect(await own.webhookConfigured(callback)).toBe(false);
    }
    fetchMock.mockImplementation(() => respond({ data: [{ object: 'whatsapp_business_account', callback_url: callback, active: true, fields: [{ name: 'messages' }] }] }));
    expect(await own.webhookConfigured(callback)).toBe(true);
  });
  it('uses the customer app secret for outgoing proof instead of the platform secret', async () => {
    const credentials = new ChannelCredentialsService(config);
    const secret = 'cd'.repeat(16);
    fetchMock.mockImplementation(() => respond({ messages: [{ id: 'message-id' }] }));
    await new MetaWhatsAppClient(credentials, config).sendTextMessage({ phoneNumberId: '111111', accessToken: credentials.seal(token), appSecretEnc: credentials.seal(secret), toPhone: '51000000000', text: 'Synthetic' });
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('appsecret_proof')).toBe(createHmac('sha256', secret).update(token).digest('hex'));
  });
});
