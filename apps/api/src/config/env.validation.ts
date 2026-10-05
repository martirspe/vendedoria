import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Min,
  Max,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';
import { TURNSTILE_TEST_SECRET } from '../turnstile/turnstile.service';

const AWS_REGION = /^[a-z]{2}(-[a-z]+)+-\d$/;
const TURNSTILE_KEY = /^[\w-]{20,128}$/;

class EnvironmentVariables {
  @IsOptional() @IsIn(['legacy', 'sales-engine-v2'])
  SALES_ENGINE_MODE?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10000)
  SALES_DEBOUNCE_MS?: number;
  @IsOptional() @IsInt() @Min(10) @Max(80)
  SALES_RECENT_MESSAGES_LIMIT?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100)
  SALES_SUMMARY_THRESHOLD?: number;
  @IsOptional() @IsInt() @Min(4000) @Max(64000)
  SALES_CONTEXT_TOKEN_BUDGET?: number;
  @IsOptional() @IsInt() @Min(60) @Max(86400)
  SALES_MEMORY_TTL_SECONDS?: number;
  @IsOptional() @IsInt() @Min(1) @Max(365)
  SALES_CUSTOMER_MEMORY_TTL_DAYS?: number;
  @IsOptional() @IsInt() @Min(10000) @Max(90000)
  SALES_LOCK_TTL_MS?: number;
  @IsOptional() @IsInt() @Min(1000) @Max(15000)
  SALES_TOOL_TIMEOUT_MS?: number;
  @IsOptional() @IsInt() @Min(1) @Max(40)
  SALES_RETRIEVAL_TOP_K?: number;
  @IsOptional() @Min(0) @Max(1)
  SALES_SIMILARITY_THRESHOLD?: number;
  @IsOptional() @IsIn(['text-embedding-3-small', 'text-embedding-3-large'])
  SALES_EMBEDDING_MODEL?: string;
  @IsOptional() @IsInt() @Min(1) @Max(10)
  SALES_HANDOFF_FAILURE_THRESHOLD?: number;
  @IsOptional() @IsInt() @Min(1) @Max(8)
  SALES_GATEWAY_CONCURRENCY?: number;
  @IsOptional() @IsString()
  TIKTOK_CLIENT_KEY?: string;

  @IsOptional() @IsString()
  TIKTOK_CLIENT_SECRET?: string;

  @ValidateIf((env: EnvironmentVariables) => Boolean(env.TIKTOK_CLIENT_KEY || env.TIKTOK_CLIENT_SECRET || env.TIKTOK_REDIRECT_URI))
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @Matches(/^https:\/\/[^?#]+\/api\/v1\/integrations\/tiktok-live\/oauth\/callback$/)
  TIKTOK_REDIRECT_URI?: string;
  @ValidateIf((env: EnvironmentVariables) => Boolean(env.REDIS_URL))
  @Matches(/^rediss?:\/\/[^\s]+$/)
  REDIS_URL?: string;

  @ValidateIf((env: EnvironmentVariables) => Boolean(env.QDRANT_URL))
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  @Matches(/^https?:\/\/[^/@?#]+\/?$/)
  QDRANT_URL?: string;

  @IsOptional() @IsString()
  QDRANT_API_KEY?: string;

  @ValidateIf((env: EnvironmentVariables) => Boolean(env.RECOVERY_EMAIL_FROM))
  @Matches(/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/)
  RECOVERY_EMAIL_FROM?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  PORT?: number;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @IsOptional()
  @IsString()
  JWT_ACCESS_EXPIRES_IN?: string;

  @IsOptional()
  @IsString()
  JWT_REFRESH_EXPIRES_IN?: string;

  @IsOptional()
  @IsString()
  META_VERIFY_TOKEN?: string;

  @IsOptional()
  @IsString()
  META_APP_SECRET?: string;

  @IsOptional()
  @IsString()
  INSTAGRAM_APP_SECRET?: string;

  @IsOptional()
  @IsString()
  CLOUDFLARE_SAAS_ZONE_ID?: string;

  @IsOptional()
  @IsString()
  CLOUDFLARE_SAAS_API_TOKEN?: string;

  @IsOptional()
  @IsString()
  CUSTOM_DOMAIN_CNAME_TARGET?: string;

  @IsOptional()
  @IsString()
  OPENAI_API_KEY?: string;

  @IsOptional()
  @IsString()
  OPENAI_MODEL?: string;

  @IsOptional()
  @IsString()
  OPENAI_IMAGE_MODEL?: string;

  @IsOptional()
  @IsString()
  PUBLIC_API_BASE_URL?: string;

  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  /** 32 bytes (64 hex chars or base64) encrypting each tenant's payment credentials. */
  @IsOptional()
  @Matches(/^([0-9a-fA-F]{64}|[A-Za-z0-9+/_-]{43}=?)$/)
  PAYMENT_CREDENTIALS_KEY?: string;

  /** VendedorIA's own Mercado Pago account, charging plans to tenants (flow A). */
  @IsOptional()
  @IsString()
  PLATFORM_MERCADOPAGO_ACCESS_TOKEN?: string;

  /** Same account and environment as the access token; sent to the console for the Card Payment Brick. */
  @IsOptional()
  @IsString()
  PLATFORM_MERCADOPAGO_PUBLIC_KEY?: string;

  @IsOptional()
  @IsString()
  PLATFORM_MERCADOPAGO_WEBHOOK_SECRET?: string;

  /** preview: orders record the email without sending it; live: sent through EMAIL_PROVIDER. */
  @IsOptional()
  @Matches(/^(preview|live)$/)
  EMAIL_MODE?: string;

  /** ses (default) or resend. */
  @IsOptional()
  @IsIn(['ses', 'resend'])
  EMAIL_PROVIDER?: string;

  @ValidateIf((env: EnvironmentVariables) => env.EMAIL_MODE === 'live' && env.EMAIL_PROVIDER === 'resend')
  @IsString()
  @MinLength(1)
  RESEND_API_KEY?: string;

  /** Verified SES identity (domain with DKIM), e.g. `Tienda <pedidos@example.pe>`. */
  @ValidateIf((env: EnvironmentVariables) => env.EMAIL_MODE === 'live')
  @Matches(/^([^<>]+<)?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>?$/)
  EMAIL_FROM?: string;

  /** SES region when it differs from AWS_REGION. */
  @IsOptional()
  @Matches(AWS_REGION)
  SES_REGION?: string;

  /** SES configuration set (bounce/complaint events, reputation metrics). */
  @IsOptional()
  @IsString()
  SES_CONFIGURATION_SET?: string;

  /** Shared by S3 and SES. Credentials come from the AWS default chain (env keys or instance role). */
  @ValidateIf(
    (env: EnvironmentVariables) =>
      env.MEDIA_STORAGE === 's3' ||
      (env.EMAIL_MODE === 'live' && env.EMAIL_PROVIDER !== 'resend' && !env.SES_REGION),
  )
  @Matches(AWS_REGION)
  AWS_REGION?: string;

  /** local (default): UPLOADS_DIR volume; s3: private bucket served through CloudFront. */
  @IsOptional()
  @IsIn(['local', 's3'])
  MEDIA_STORAGE?: string;

  @ValidateIf((env: EnvironmentVariables) => env.MEDIA_STORAGE === 's3')
  @Matches(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
  MEDIA_S3_BUCKET?: string;

  /** CloudFront distribution (or its custom domain) in front of MEDIA_S3_BUCKET; never the S3 endpoint itself. */
  @ValidateIf((env: EnvironmentVariables) => env.MEDIA_STORAGE === 's3')
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @Matches(/^https:\/\/(?![^/]*amazonaws\.com(?:[/:]|$))[^/]+\/?$/, {
    message: 'MEDIA_CDN_URL must be the CloudFront domain (or its alias) with no path, not an S3 endpoint',
  })
  MEDIA_CDN_URL?: string;

  @IsOptional()
  @Matches(/^https?:\/\/\{slug\}\.[a-z0-9.-]+(:\d+)?\/?$/)
  STOREFRONT_URL_TEMPLATE?: string;

  /** Folder for uploaded product photos (a persistent volume in production). */
  @IsOptional()
  @IsString()
  UPLOADS_DIR?: string;

  /** Cloudflare Turnstile widget (public). Set together with TURNSTILE_SECRET_KEY, or neither. */
  @ValidateIf((env: EnvironmentVariables) => Boolean(env.TURNSTILE_SITE_KEY || env.TURNSTILE_SECRET_KEY))
  @Matches(TURNSTILE_KEY)
  TURNSTILE_SITE_KEY?: string;

  @ValidateIf((env: EnvironmentVariables) => Boolean(env.TURNSTILE_SITE_KEY || env.TURNSTILE_SECRET_KEY))
  @Matches(TURNSTILE_KEY)
  TURNSTILE_SECRET_KEY?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (validated.REDIS_URL) {
    try {
      const redis = new URL(validated.REDIS_URL);
      if (!['redis:', 'rediss:'].includes(redis.protocol) || !redis.hostname || !/^\/(?:\d{1,2})?$/.test(redis.pathname || '/') || redis.search || redis.hash) throw new Error('Invalid Redis URL');
      decodeURIComponent(redis.username);
      decodeURIComponent(redis.password);
    } catch { throw new Error('REDIS_URL must be a redis/rediss URL with an optional numeric database'); }
  }

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  if (validated.TIKTOK_CLIENT_KEY || validated.TIKTOK_CLIENT_SECRET || validated.TIKTOK_REDIRECT_URI) {
    if (!validated.TIKTOK_CLIENT_KEY || !validated.TIKTOK_CLIENT_SECRET || !validated.PAYMENT_CREDENTIALS_KEY) throw new Error('TikTok OAuth requires TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REDIRECT_URI and PAYMENT_CREDENTIALS_KEY together');
    if (!validated.CORS_ORIGIN || !/^https:\/\/[^,]+$/.test(validated.CORS_ORIGIN)) throw new Error('TikTok OAuth requires a single HTTPS CORS_ORIGIN for the callback redirect');
  }
  if (validated.NODE_ENV === 'production' && TURNSTILE_TEST_SECRET.test(validated.TURNSTILE_SECRET_KEY ?? '')) {
    throw new Error('TURNSTILE_SECRET_KEY is a Cloudflare test key, which accepts any visitor; use the widget secret');
  }

  return validated;
}
