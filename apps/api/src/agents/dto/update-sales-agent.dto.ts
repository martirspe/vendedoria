import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PROMPT_MODES,
  SALES_TECHNIQUE_IDS,
} from '../../agent-runtime/sales-playbook';

export class CreateSalesAgentDto {
  @ApiProperty({ example: 'Valeria' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ description: 'Copy the configuration of this agent' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  copyFromId?: string;
}

export class AssignAgentChannelsDto {
  @ApiProperty({ type: [String], description: 'Channels this agent answers' })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  channelIds!: string[];
}

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

  @ApiPropertyOptional({
    description: 'Hard limit: never invent or offer discounts',
  })
  @IsOptional()
  @IsBoolean()
  neverOfferDiscount?: boolean;

  @ApiPropertyOptional({
    description: 'Hard limit: never invent shipping promises',
  })
  @IsOptional()
  @IsBoolean()
  neverInventShipping?: boolean;

  @ApiPropertyOptional({
    description: 'Hard limit: product facts only from catalog tools',
  })
  @IsOptional()
  @IsBoolean()
  catalogOnlyFacts?: boolean;

  @ApiPropertyOptional({ enum: SALES_TECHNIQUE_IDS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SALES_TECHNIQUE_IDS.length)
  @IsIn(SALES_TECHNIQUE_IDS, { each: true })
  salesTechniques?: string[];

  @ApiPropertyOptional({
    description: 'Merchant answers to frequent buyer objections',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  objectionHandling?: string;

  @ApiPropertyOptional({ enum: PROMPT_MODES })
  @IsOptional()
  @IsIn(PROMPT_MODES)
  promptMode?: string;

  @ApiPropertyOptional({
    description: 'Full persona prompt used when promptMode is custom; system guardrails still apply',
  })
  @IsOptional()
  @IsString()
  @MaxLength(12000)
  customPrompt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
