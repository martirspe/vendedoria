import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const RUC = /^(10|15|16|17|20)\d{9}$/;
const URL_OPTIONS = { protocols: ['https', 'http'], require_protocol: true };

export class UpdateStorefrontDto {
  @ApiPropertyOptional({ example: 'Casa Andina Store' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName?: string;

  @ApiPropertyOptional({ example: 'Ropa de algodón peruano, directo del taller' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(140)
  tagline?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl(URL_OPTIONS)
  @MaxLength(500)
  logoUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl(URL_OPTIONS)
  @MaxLength(500)
  heroImageUrl?: string | null;

  @ApiPropertyOptional({ example: '#0b0d12' })
  @IsOptional()
  @Matches(HEX_COLOR)
  brandColor?: string;

  @ApiPropertyOptional({ example: '#5b8cff' })
  @IsOptional()
  @Matches(HEX_COLOR)
  accentColor?: string;

  @ApiPropertyOptional({ example: '51987654321', description: 'Digits only, with country code' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^\d{8,15}$/)
  whatsappPhone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEmail()
  @MaxLength(160)
  contactEmail?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(70)
  seoTitle?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(160)
  seoDescription?: string | null;

  @ApiPropertyOptional({ example: 'Casa Andina S.A.C.' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(160)
  legalName?: string | null;

  @ApiPropertyOptional({ example: '20123456789' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(RUC, { message: 'El RUC debe tener 11 dígitos y empezar con 10, 15, 16, 17 o 20.' })
  ruc?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(240)
  legalAddress?: string | null;

  @ApiPropertyOptional({ description: 'Virtual complaints book (Libro de Reclamaciones) URL' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  complaintsBookUrl?: string | null;

  @ApiPropertyOptional({ description: 'Personal data bank registration code (ANPD)' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(60)
  dataBankCode?: string | null;

  @ApiPropertyOptional({ description: '0 = only legal guarantee' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  exchangeDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  deliveryEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(100_000)
  shippingLimaCents?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(100_000)
  shippingProvinceCents?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  freeShippingFromCents?: number | null;

  @ApiPropertyOptional({ example: '1 a 2 días hábiles' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(60)
  deliveryDaysLima?: string | null;

  @ApiPropertyOptional({ example: '3 a 5 días hábiles' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(60)
  deliveryDaysProvince?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pickupEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(240)
  pickupAddress?: string | null;
}
