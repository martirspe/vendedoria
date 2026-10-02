import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBase64,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class InventoryRowDto {
  @ApiProperty()
  @IsString()
  @MaxLength(40)
  productId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  variantId?: string;

  @ApiProperty({ nullable: true, description: 'null = unlimited (not tracked)' })
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(100_000)
  stockQty!: number | null;
}

export class InventoryUpdateDto {
  @ApiProperty({ type: [InventoryRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => InventoryRowDto)
  items!: InventoryRowDto[];
}

/** Image already resized in the browser; the JSON body limit keeps it under 1 MB. */
export class MediaUploadDto {
  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'] })
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType!: 'image/jpeg' | 'image/png' | 'image/webp';

  @ApiProperty({ description: 'Base64 file content without the data: prefix' })
  @IsBase64()
  @MaxLength(1_000_000)
  data!: string;
}
