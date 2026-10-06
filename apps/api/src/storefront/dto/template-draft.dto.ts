import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { TEXT_AI_ACTIONS, type TextAiAction } from '../store-ai-text';

export class EditorRevisionDto {
  @ApiPropertyOptional({ description: 'Revision returned by the editor; prevents concurrent overwrites.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  savedAt?: string;
}

export class SaveTemplateDraftDto extends EditorRevisionDto {
  @ApiProperty({
    description:
      'StoreTemplateContent: { version: 1, sections: { [section]: { [field]: string } }, faq?: { question, answer }[] }. ' +
      'Unknown fields are dropped; images must be uploads of this business.',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  content!: Record<string, unknown>;
}

export class StageThemeDto {
  @ApiProperty({ description: 'Immutable catalog slug.' })
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{1,39}$/)
  template!: string;

  @ApiProperty({ description: 'Exact available release (SemVer).' })
  @IsString()
  @Matches(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/)
  @MaxLength(32)
  version!: string;

  @ApiPropertyOptional({ description: 'Editorial preset to import without replacing customizations or inventory.' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{1,39}$/)
  preset?: string;

  @ApiProperty({ description: 'Current editor revision.' })
  @IsISO8601({ strict: true })
  savedAt!: string;
}

export class ScheduleTemplateDraftDto extends EditorRevisionDto {
  @ApiProperty({
    description:
      'When the draft is published (ISO 8601), between 5 minutes and 90 days from now.',
  })
  @IsISO8601({ strict: true })
  publishAt!: string;
}

export class SuggestTemplateSectionDto {
  @ApiProperty({
    description: 'What the section should be about, in the merchant words.',
    example: 'Beneficios de comprar en mi tienda',
  })
  @IsString()
  @MaxLength(300)
  prompt!: string;
}

export class SuggestTemplatePageDto {
  @ApiProperty({
    description:
      'The business and what the home page should highlight, in the merchant words.',
    example:
      'Cosmética natural hecha en Arequipa; quiero destacar los envíos y los regalos',
  })
  @IsString()
  @MaxLength(500)
  prompt!: string;
}

export class SuggestTemplateImageDto {
  @ApiProperty({
    description: 'Content key of the section (`hero`, `imageText-a1b2c3`).',
    example: 'hero',
  })
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-zA-Z]+(-[a-z0-9]{6})?$/)
  section!: string;

  @ApiProperty({ description: 'Image field of the section.', example: 'image' })
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-zA-Z0-9]+$/)
  field!: string;

  @ApiPropertyOptional({
    description: 'Scene, mood or colors the merchant wants (never products).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  instruction?: string;
}

export class SuggestTemplateTextDto {
  @ApiProperty({
    description: 'Content key of the section (`hero`, `benefits-a1b2c3`).',
    example: 'hero',
  })
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-zA-Z]+(-[a-z0-9]{6})?$/)
  section!: string;

  @ApiProperty({ description: 'Text field of the section.', example: 'title' })
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-zA-Z0-9]+$/)
  field!: string;

  @ApiProperty({ enum: TEXT_AI_ACTIONS })
  @IsIn(TEXT_AI_ACTIONS)
  action!: TextAiAction;

  @ApiPropertyOptional({
    description:
      'Text in the field now; required for every action but `write`.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  current?: string;

  @ApiPropertyOptional({
    description: 'What the merchant wants to highlight (focus or style only).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  instruction?: string;
}
