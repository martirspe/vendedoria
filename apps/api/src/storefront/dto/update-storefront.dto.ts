import { ApiPropertyOptional } from '@nestjs/swagger';
import { SellerType } from '@prisma/client';
import {
  IsEmail,
  IsIn,
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
import { INDUSTRIES, TEMPLATES } from '../store-templates';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const RUC = /^(10|15|16|17|20)\d{9}$/;
export const DNI = /^\d{8}$/;
const SELLER_TYPES = Object.values(SellerType);
/** Same rule as product photos: uploads served by the API itself live on hosts without a TLD (localhost) in dev. */
const URL_OPTIONS = { protocols: ['https', 'http'], require_protocol: true, require_tld: false };
const IMAGE_URL_MESSAGE = { message: 'Usa un enlace de imagen válido que empiece con https://.' };

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
  @IsUrl(URL_OPTIONS, IMAGE_URL_MESSAGE)
  @MaxLength(500)
  logoUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl(URL_OPTIONS, IMAGE_URL_MESSAGE)
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

  @ApiPropertyOptional({ enum: SELLER_TYPES, description: 'BUSINESS has RUC; INDIVIDUAL sells without RUC (DNI, kept private)' })
  @IsOptional()
  @IsIn(SELLER_TYPES)
  sellerType?: SellerType;

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

  @ApiPropertyOptional({ example: '45678912', description: 'Only for INDIVIDUAL sellers; never shown in the store' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(DNI, { message: 'El DNI debe tener 8 dígitos.' })
  dni?: string | null;

  @ApiPropertyOptional({ example: 'Miraflores, Lima', description: 'Shown in the store instead of the address for INDIVIDUAL sellers' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  legalDistrict?: string | null;

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

  @ApiPropertyOptional({ enum: INDUSTRIES })
  @IsOptional()
  @IsIn(INDUSTRIES)
  industry?: string;

  @ApiPropertyOptional({ enum: ['classic', 'selecta', 'stride'] })
  @IsOptional()
  @IsIn(Object.keys(TEMPLATES))
  template?: string;
}
