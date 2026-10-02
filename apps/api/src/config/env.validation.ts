import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
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
  OPENAI_API_KEY?: string;

  @IsOptional()
  @IsString()
  OPENAI_MODEL?: string;

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

  /** preview: orders record the email without sending it; live: sent with Resend. */
  @IsOptional()
  @Matches(/^(preview|live)$/)
  EMAIL_MODE?: string;

  @IsOptional()
  @IsString()
  RESEND_API_KEY?: string;

  @IsOptional()
  @IsString()
  EMAIL_FROM?: string;

  @IsOptional()
  @Matches(/^https?:\/\/\{slug\}\.[a-z0-9.-]+(:\d+)?\/?$/)
  STOREFRONT_URL_TEMPLATE?: string;

  /** Folder for uploaded product photos (a persistent volume in production). */
  @IsOptional()
  @IsString()
  UPLOADS_DIR?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validated;
}
