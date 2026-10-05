import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class LiveSettingsDto {
  @ApiProperty({ enum: ['AUTO', 'HUMAN_APPROVAL', 'HUMAN_ONLY'] })
  @IsIn(['AUTO', 'HUMAN_APPROVAL', 'HUMAN_ONLY'])
  responseMode!: string;
  @ApiProperty({ default: 300 })
  @IsInt()
  @Min(60)
  @Max(900)
  reservationSeconds!: number;
  @ApiProperty({ default: 500 })
  @IsInt()
  @Min(1)
  @Max(5000)
  maxReservationsPerSession!: number;
}
export class LiveOfferDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(40) productId!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  variantId?: string;
  @ApiProperty() @IsInt() @Min(100) @Max(10000000) livePriceCents!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(100000) allocatedStock!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(20) maxPerCustomer!: number;
  @ApiProperty() @IsInt() @Min(60) @Max(86400) durationSeconds!: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}
export class LiveCampaignDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @ApiProperty({ enum: ['LIVE_SALE', 'LIVE_LIQUIDATION'] })
  @IsIn(['LIVE_SALE', 'LIVE_LIQUIDATION'])
  mode!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  salesAgentId?: string;
  @ApiProperty() @IsInt() @Min(60) @Max(900) reservationSeconds!: number;
  @ApiProperty({ type: [LiveOfferDto] })
  @ValidateNested({ each: true })
  @Type(() => LiveOfferDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  products!: LiveOfferDto[];
}
export class CurrentLiveProductDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(40) offerId!: string;
}
export class LiveMessageDto {
  @ApiProperty({ description: 'Operator-entered alias, not a phone or email.' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  customerAlias!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(1000) text!: string;
  @ApiProperty() @IsUUID() eventId!: string;
}
export class ReserveLiveDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  customerAlias!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(40) offerId!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(20) quantity!: number;
  @ApiProperty() @IsUUID() idempotencyKey!: string;
}
export class LiveTokenDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[a-z0-9]{20,40}\.\d{13}\.[A-Za-z0-9_-]{43}$/)
  token!: string;
}
export class TikTokCallbackDto {
  @ApiProperty() @IsString() @MaxLength(100) state!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  code?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  error?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  scopes?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  error_description?: string;
}
