import 'reflect-metadata';
import { validateEnv } from './env.validation';

const BASE = {
  DATABASE_URL: 'postgresql://localhost/test',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv AWS settings', () => {
  it('keeps local storage and preview email working with no AWS settings', () => {
    expect(() => validateEnv(BASE)).not.toThrow();
  });

  it('requires bucket, region and an https CDN URL for S3 media', () => {
    expect(() => validateEnv({ ...BASE, MEDIA_STORAGE: 's3' })).toThrow(/MEDIA_S3_BUCKET/);
    expect(() =>
      validateEnv({
        ...BASE,
        MEDIA_STORAGE: 's3',
        AWS_REGION: 'us-east-1',
        MEDIA_S3_BUCKET: 'vendedoria-media',
        MEDIA_CDN_URL: 'http://cdn.example.pe',
      }),
    ).toThrow(/MEDIA_CDN_URL/);
    const s3 = { ...BASE, MEDIA_STORAGE: 's3', AWS_REGION: 'us-east-1', MEDIA_S3_BUCKET: 'vendedoria-media' };
    for (const url of [
      'https://d111111abcdef8.cloudfront.net',
      'https://d111111abcdef8.cloudfront.net/',
      'https://media.example.pe',
    ]) {
      expect(() => validateEnv({ ...s3, MEDIA_CDN_URL: url })).not.toThrow();
    }
  });

  it('rejects S3 endpoints and paths as CDN URL so the bucket never has to be public', () => {
    const s3 = { ...BASE, MEDIA_STORAGE: 's3', AWS_REGION: 'us-east-1', MEDIA_S3_BUCKET: 'vendedoria-media' };
    for (const url of [
      'https://vendedoria-media.s3.us-east-1.amazonaws.com',
      'https://s3.amazonaws.com/vendedoria-media',
      'https://d111111abcdef8.cloudfront.net/media',
    ]) {
      expect(() => validateEnv({ ...s3, MEDIA_CDN_URL: url })).toThrow(/MEDIA_CDN_URL/);
    }
  });

  it('requires a sender and a region before sending live email through SES', () => {
    expect(() => validateEnv({ ...BASE, EMAIL_MODE: 'live' })).toThrow(/EMAIL_FROM/);
    expect(() => validateEnv({ ...BASE, EMAIL_MODE: 'live', EMAIL_FROM: 'pedidos@example.pe' })).toThrow(
      /AWS_REGION/,
    );
    expect(() =>
      validateEnv({
        ...BASE,
        EMAIL_MODE: 'live',
        EMAIL_FROM: 'Tienda <pedidos@example.pe>',
        SES_REGION: 'sa-east-1',
      }),
    ).not.toThrow();
  });

  it('requires the API key when Resend is the provider', () => {
    expect(() =>
      validateEnv({ ...BASE, EMAIL_MODE: 'live', EMAIL_PROVIDER: 'resend', EMAIL_FROM: 'pedidos@example.pe' }),
    ).toThrow(/RESEND_API_KEY/);
  });
});

describe('validateEnv Turnstile settings', () => {
  const SITE = '0x4AAAAAAAexampleSiteKey';
  const SECRET = '0x4AAAAAAAexampleSecretKey_0123456789';

  it('needs both keys or neither', () => {
    expect(() => validateEnv({ ...BASE, TURNSTILE_SITE_KEY: SITE })).toThrow(/TURNSTILE_SECRET_KEY/);
    expect(() => validateEnv({ ...BASE, TURNSTILE_SECRET_KEY: SECRET })).toThrow(/TURNSTILE_SITE_KEY/);
    expect(() => validateEnv({ ...BASE, TURNSTILE_SITE_KEY: SITE, TURNSTILE_SECRET_KEY: SECRET })).not.toThrow();
  });

  it('allows Cloudflare test keys in development but never in production', () => {
    const test = {
      ...BASE,
      TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
      TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
    };
    expect(() => validateEnv({ ...test, NODE_ENV: 'development' })).not.toThrow();
    expect(() => validateEnv({ ...test, NODE_ENV: 'production' })).toThrow(/test key/);
  });
});
