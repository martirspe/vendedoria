import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CheckoutItemDto } from '../../checkout/dto/checkout.dto';

export class RecoveryCaptureDto {
  @ApiProperty() @IsUUID('4') sessionId!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(130)
  token?: string;
  @ApiProperty({ type: [CheckoutItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\+?[1-9]\d{7,14}$/)
  phone?: string;
  @ApiProperty() @IsBoolean() emailConsent!: boolean;
  @ApiProperty() @IsBoolean() whatsappConsent!: boolean;
}

export class RecoveryAccessDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[a-z0-9]{20,40}\.\d{13}\.[A-Za-z0-9_-]{43}$/)
  token!: string;
}

export class RecoveryActivityDto extends RecoveryAccessDto {
  @ApiProperty({ type: [CheckoutItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];
}

export class ConversionSettingsDto {
  @ApiProperty() @IsBoolean() recoveryEnabled!: boolean;
  @ApiProperty() @IsBoolean() emailEnabled!: boolean;
  @ApiProperty() @IsBoolean() whatsappEnabled!: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[a-z0-9_]{1,100}$/)
  whatsappTemplate?: string;
  @ApiProperty() @Matches(/^[a-z]{2}(?:_[A-Z]{2})?$/) whatsappLanguage!: string;
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(4320, { each: true })
  delaysMinutes!: number[];
}

export class RecommendationQueryDto {
  @ApiPropertyOptional({
    description: 'Comma-separated cart/product handles, max 40',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  handles?: string[];
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') sessionId?: string;
  @ApiPropertyOptional({ enum: ['product', 'cart', 'checkout'] })
  @IsOptional()
  @IsIn(['product', 'cart', 'checkout'])
  context?: 'product' | 'cart' | 'checkout';
}

export class BehaviorEventDto {
  @ApiProperty() @IsUUID('4') sessionId!: string;
  @ApiProperty({ enum: ['VIEW', 'CART'] }) @IsIn(['VIEW', 'CART']) kind!:
    'VIEW' | 'CART';
  @ApiProperty() @IsString() @MaxLength(120) handle!: string;
  @ApiProperty() @Equals(true) consent!: true;
}

export class BehaviorForgetDto {
  @ApiProperty() @IsUUID('4') sessionId!: string;
}
