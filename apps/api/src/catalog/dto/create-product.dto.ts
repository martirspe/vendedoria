import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProductVariantInputDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ example: 'SKU-NEGRO-M' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ example: 'Color' })
  @IsOptional()
  @IsString()
  option1Name?: string;

  @ApiPropertyOptional({ example: 'Negro' })
  @IsOptional()
  @IsString()
  option1Value?: string;

  @ApiPropertyOptional({ example: 'Talla' })
  @IsOptional()
  @IsString()
  option2Name?: string;

  @ApiPropertyOptional({ example: 'M' })
  @IsOptional()
  @IsString()
  option2Value?: string;

  @ApiProperty({ example: 8900 })
  @IsInt()
  @Min(0)
  priceCents!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  stockQty?: number | null;
}

export class ScentNoteDto {
  @ApiProperty({ example: 'Salida' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ example: 'Bergamota y pimienta rosa' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}

/** Rich product content used by templates such as Selecta. */
export class ProductDetailsDto {
  @ApiPropertyOptional({ example: '50 ml' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  size?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(400, { each: true })
  benefits?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(400, { each: true })
  usage?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(400, { each: true })
  notes?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'What the piece contains (shown in sets)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(400, { each: true })
  highlights?: string[];

  @ApiPropertyOptional({ example: 'Floral' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  family?: string;

  @ApiPropertyOptional({ example: 'Intensa' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  intensity?: string;

  @ApiPropertyOptional({ type: [ScentNoteDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => ScentNoteDto)
  scent?: ScentNoteDto[];

  @ApiPropertyOptional({
    description: 'Show the gallery photos together as one composition',
  })
  @IsOptional()
  @IsBoolean()
  montage?: boolean;
}

export class ProductMediaInputDto {
  @ApiProperty()
  @IsUrl({
    protocols: ['https', 'http'],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(500)
  url!: string;

  @ApiPropertyOptional({ enum: ['image', 'related'] })
  @IsOptional()
  @IsIn(['image', 'related'])
  kind?: 'image' | 'related';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  alt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string;
}

/** Piece of a set: the set takes `quantity` units of this product per unit sold. */
export class ProductComponentInputDto {
  @ApiProperty()
  @IsString()
  @MaxLength(40)
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: 20 })
  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;
}

export const PRODUCT_KINDS = ['PRODUCT', 'SERVICE'] as const;
export const SERVICE_MODES = ['onsite', 'home', 'online'] as const;
export type ServiceMode = (typeof SERVICE_MODES)[number];

/** Fields shared by create and update for templates, sets, inventory and services. */
export class ProductExtrasDto {
  @ApiPropertyOptional({
    enum: PRODUCT_KINDS,
    description: 'A SERVICE has no stock and is never shipped',
  })
  @IsOptional()
  @IsIn(PRODUCT_KINDS)
  kind?: (typeof PRODUCT_KINDS)[number];

  @ApiPropertyOptional({
    example: 60,
    description: 'Services only: approximate length in minutes',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(5)
  @Max(1440)
  durationMinutes?: number | null;

  @ApiPropertyOptional({
    enum: SERVICE_MODES,
    description: 'Services only: where it is delivered',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(SERVICE_MODES)
  serviceMode?: ServiceMode | null;

  @ApiPropertyOptional({ example: 'PER-50' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(60)
  sku?: string | null;

  @ApiPropertyOptional({ example: 'Ccori' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(80)
  line?: string | null;

  @ApiPropertyOptional({ type: ProductDetailsDto, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ValidateNested()
  @Type(() => ProductDetailsDto)
  details?: ProductDetailsDto | null;

  @ApiPropertyOptional({
    type: [ProductMediaInputDto],
    description: 'Replaces mediaUrls when sent',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ProductMediaInputDto)
  media?: ProductMediaInputDto[];

  @ApiPropertyOptional({
    type: [ProductComponentInputDto],
    description: 'Pieces when sold as a set',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProductComponentInputDto)
  components?: ProductComponentInputDto[];
}

export class CreateProductDto extends ProductExtrasDto {
  @ApiProperty({ example: 'polo-basico' })
  @IsString()
  @MinLength(2)
  handle!: string;

  @ApiProperty({ example: 'Polo básico' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descriptionShort?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descriptionFull?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiProperty({ example: 8900, description: 'Price in cents' })
  @IsInt()
  @Min(0)
  basePriceCents!: number;

  @ApiPropertyOptional({ example: 'PEN' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  stockUnlimited?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  stockQty?: number;

  @ApiPropertyOptional({ type: [ProductVariantInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantInputDto)
  variants?: ProductVariantInputDto[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Public media URLs (from POST /catalog/media)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaUrls?: string[];

  @ApiPropertyOptional({ description: 'Visible in the tenant web store' })
  @IsOptional()
  @IsBoolean()
  isPublishedOnStore?: boolean;

  @ApiPropertyOptional({
    example: 12900,
    description: 'Struck-through price in cents',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  compareAtPriceCents?: number | null;

  @ApiPropertyOptional({ example: 'Andes Cotton' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(60)
  brand?: string | null;

  @ApiPropertyOptional({
    example: 0,
    description: 'Lower numbers appear first in the store',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

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
