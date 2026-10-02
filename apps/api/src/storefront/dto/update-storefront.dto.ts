import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
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
}
