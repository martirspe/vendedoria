import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { ProductKind, PublicProductSort } from '@vendedoria/contracts';

const SORTS: PublicProductSort[] = ['featured', 'newest', 'price-asc', 'price-desc'];
const KINDS: ProductKind[] = ['PRODUCT', 'SERVICE', 'DIGITAL'];

export class ResolveStoreQueryDto {
  @ApiPropertyOptional({ example: 'acme-1a2b3c.localhost:4300' })
  @IsString()
  @MaxLength(253)
  host!: string;
}

export class ProductListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ enum: SORTS })
  @IsOptional()
  @IsIn(SORTS)
  sort?: PublicProductSort;

  @ApiPropertyOptional({ enum: KINDS })
  @IsOptional()
  @IsIn(KINDS)
  kind?: ProductKind;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  page?: number;

  @ApiPropertyOptional({ example: 24 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(48)
  pageSize?: number;
}
