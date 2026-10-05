import 'reflect-metadata';
import { validateEnv } from '../config/env.validation';

describe('TikTok OAuth configuration', () => {
  const base = {
    DATABASE_URL: 'postgresql://localhost/test',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
  };
  const oauth = {
    ...base,
    TIKTOK_CLIENT_KEY: 'fixture-client',
    TIKTOK_CLIENT_SECRET: 'fixture-secret',
    TIKTOK_REDIRECT_URI:
      'https://api.example.test/api/v1/integrations/tiktok-live/oauth/callback',
    PAYMENT_CREDENTIALS_KEY: '09'.repeat(32),
    CORS_ORIGIN: 'https://console.example.test',
  };
  it('allows manual operation with no external credentials', () => {
    expect(() => validateEnv(base)).not.toThrow();
  });
  it('requires complete encrypted OAuth settings and an exact HTTPS callback', () => {
    expect(() => validateEnv(oauth)).not.toThrow();
    expect(() =>
      validateEnv({ ...oauth, PAYMENT_CREDENTIALS_KEY: undefined }),
    ).toThrow(/TikTok/);
    expect(() =>
      validateEnv({
        ...oauth,
        TIKTOK_REDIRECT_URI: 'http://api.example.test/callback',
      }),
    ).toThrow(/TIKTOK_REDIRECT_URI/);
    expect(() =>
      validateEnv({ ...oauth, TIKTOK_REDIRECT_URI: undefined }),
    ).toThrow(/TIKTOK_REDIRECT_URI/);
    expect(() =>
      validateEnv({
        ...oauth,
        CORS_ORIGIN: 'https://one.example.test,https://two.example.test',
      }),
    ).toThrow(/CORS_ORIGIN/);
  });
});
