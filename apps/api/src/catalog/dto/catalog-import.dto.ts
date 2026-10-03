import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_IMPORT_IMAGES } from '../catalog-import';

const SHA256 = /^[a-f0-9]{64}$/;

export class CatalogImportFileDto {
  @ApiProperty({
    example: 'item-20013590/foto-1.jpg',
    description: 'Path inside the package images folder',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  path!: string;

  @ApiProperty({ description: 'SHA-256 (hex) of the original file' })
  @Matches(SHA256)
  hash!: string;
}

export class CatalogImportOptionsDto {
  @ApiPropertyOptional({
    description: 'Overwrite prices of existing products with the file prices',
  })
  @IsOptional()
  @IsBoolean()
  updatePrices?: boolean;

  @ApiPropertyOptional({
    description: 'Overwrite stock of existing products with the file inventory',
  })
  @IsOptional()
  @IsBoolean()
  updateStock?: boolean;

  @ApiPropertyOptional({
    description:
      'Unpublish store products missing from the file or inactive in it',
  })
  @IsOptional()
  @IsBoolean()
  fullSync?: boolean;

  @ApiPropertyOptional({
    description: 'Apply the package store block (template, shipping, images)',
  })
  @IsOptional()
  @IsBoolean()
  applyStoreSettings?: boolean;
}

export class CatalogImportPreviewDto {
  @ApiProperty({
    description:
      'Raw text of catalog.json (the whole request stays under the 1 MB body limit)',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(800_000)
  catalog!: string;

  @ApiProperty({
    type: [CatalogImportFileDto],
    description: 'Photos found in the package',
  })
  @IsArray()
  @ArrayMaxSize(MAX_IMPORT_IMAGES)
  @ValidateNested({ each: true })
  @Type(() => CatalogImportFileDto)
  files!: CatalogImportFileDto[];

  @ApiPropertyOptional({ type: CatalogImportOptionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CatalogImportOptionsDto)
  options?: CatalogImportOptionsDto;
}

export class CatalogImportUploadDto {
  @ApiProperty()
  @Matches(SHA256)
  hash!: string;

  @ApiProperty({ description: 'URL returned by POST /catalog/import/media' })
  @IsUrl({
    protocols: ['https', 'http'],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(500)
  url!: string;
}

export class CatalogImportCommitDto extends CatalogImportPreviewDto {
  @ApiProperty({
    type: [CatalogImportUploadDto],
    description: 'Photos uploaded for this import',
  })
  @IsArray()
  @ArrayMaxSize(MAX_IMPORT_IMAGES)
  @ValidateNested({ each: true })
  @Type(() => CatalogImportUploadDto)
  uploaded!: CatalogImportUploadDto[];
}
