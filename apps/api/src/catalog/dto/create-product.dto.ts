import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
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

export class CreateProductDto {
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
    description: 'Public media URLs (S3 upload comes later)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaUrls?: string[];
}
