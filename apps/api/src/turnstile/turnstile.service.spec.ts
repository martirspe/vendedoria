import { ConfigService } from '@nestjs/config';
import { TurnstileService } from './turnstile.service';

const SECRET = '0x4AAAAAAAexampleSecretKey_0123456789';
const TOKEN = 'token-from-widget';

function service(env: Record<string, string> = {}) {
  return new TurnstileService(
    new ConfigService({
      TURNSTILE_SITE_KEY: '0x4AAAAAAAexampleSiteKey',
      TURNSTILE_SECRET_KEY: SECRET,
      CORS_ORIGIN: 'https://app.example.pe',
      STOREFRONT_URL_TEMPLATE: 'https://{slug}.tiendas.example.pe',
      ...env,
    }),
  );
}

function answer(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('TurnstileService', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => jest.restoreAllMocks());

  it('is off without a secret and never calls Cloudflare', async () => {
    const off = service({ TURNSTILE_SECRET_KEY: '', TURNSTILE_SITE_KEY: '' });
    expect(off.enabled).toBe(false);
    expect(off.siteKey).toBeNull();
    await expect(off.verify(undefined, { action: 'login' })).resolves.toBe('ok');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects missing or oversized tokens before calling Siteverify', async () => {
    const s = service();
    await expect(s.verify(undefined, { action: 'login' })).resolves.toBe('rejected');
    await expect(s.verify('x'.repeat(2049), { action: 'login' })).resolves.toBe('rejected');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redeems the token with secret, client IP and an idempotency key', async () => {
    fetchMock.mockResolvedValue(answer({ success: true, action: 'login', hostname: 'app.example.pe' }));
    await expect(service().verify(TOKEN, { action: 'login', remoteIp: '203.0.113.7' })).resolves.toBe('ok');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ secret: SECRET, response: TOKEN, remoteip: '203.0.113.7' });
    expect(body.idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects failed, spent, foreign-action and foreign-host tokens', async () => {
    const s = service();
    fetchMock.mockResolvedValueOnce(answer({ success: false, 'error-codes': ['timeout-or-duplicate'] }));
    await expect(s.verify(TOKEN, { action: 'login' })).resolves.toBe('rejected');
    fetchMock.mockResolvedValueOnce(answer({ success: true, action: 'register', hostname: 'app.example.pe' }));
    await expect(s.verify(TOKEN, { action: 'login' })).resolves.toBe('rejected');
    fetchMock.mockResolvedValueOnce(answer({ success: true, action: 'login', hostname: 'evil.example.com' }));
    await expect(s.verify(TOKEN, { action: 'login' })).resolves.toBe('rejected');
  });

  it('accepts store tokens only from a host of the same store', async () => {
    const s = service();
    fetchMock.mockResolvedValueOnce(answer({ success: true, action: 'checkout', hostname: 'acme.tiendas.example.pe' }));
    await expect(s.verify(TOKEN, { action: 'checkout', storeSlug: 'acme' })).resolves.toBe('ok');
    fetchMock.mockResolvedValueOnce(answer({ success: true, action: 'checkout', hostname: 'other.tiendas.example.pe' }));
    await expect(s.verify(TOKEN, { action: 'checkout', storeSlug: 'acme' })).resolves.toBe('rejected');
    fetchMock.mockResolvedValueOnce(answer({ success: true, action: 'checkout', hostname: 'app.example.pe' }));
    await expect(s.verify(TOKEN, { action: 'checkout', storeSlug: 'acme' })).resolves.toBe('rejected');
  });

  it('retries once with the same idempotency key, then reports Cloudflare unavailable', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(answer({}, 503));
    await expect(service().verify(TOKEN, { action: 'checkout', storeSlug: 'acme' })).resolves.toBe('unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const keys = fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string).idempotency_key);
    expect(keys[0]).toBe(keys[1]);
  });

  it('skips action and hostname checks only with Cloudflare test secrets', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(answer({ success: true, action: 'test', hostname: 'localhost' })));
    const test = service({ TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' });
    await expect(test.verify('XXXX.DUMMY.TOKEN.XXXX', { action: 'login' })).resolves.toBe('ok');
    await expect(service().verify(TOKEN, { action: 'login' })).resolves.toBe('rejected');
  });
});
