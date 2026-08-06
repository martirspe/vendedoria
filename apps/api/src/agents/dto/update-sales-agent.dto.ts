import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSalesAgentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  companyDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  audienceDescription?: string;

  @ApiPropertyOptional({
    description: 'ALWAYS / NEVER rules and hard limits for the sales agent',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  rulesText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  communicationStyle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  salesStyle?: string;

  @ApiPropertyOptional({ enum: ['concise', 'balanced', 'detailed'] })
  @IsOptional()
  @IsString()
  @IsIn(['concise', 'balanced', 'detailed'])
  responseLength?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  useEmojis?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  emojiPalette?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  wordsToAvoid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  initialMessage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  purchaseConfirmMessage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  handoffMessage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pauseOnHandoff?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
