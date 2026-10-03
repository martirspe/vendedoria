import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CARRIER_TIERS, MAX_CARRIER_RATE_CENTS } from '../../storefront/shipping';

/** Five tiers in cents: ≤20 km, ≤100 km, ≤400 km, ≤900 km, farther. */
export class CarrierRatesDto {
  @ApiPropertyOptional({ type: [Number], example: [900, 1200, 1600, 2200, 2800] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(CARRIER_TIERS)
  @ArrayMaxSize(CARRIER_TIERS)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(MAX_CARRIER_RATE_CENTS, { each: true })
  olva?: number[];

  @ApiPropertyOptional({ type: [Number], example: [800, 1000, 1400, 1800, 2400] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(CARRIER_TIERS)
  @ArrayMaxSize(CARRIER_TIERS)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(MAX_CARRIER_RATE_CENTS, { each: true })
  shalom?: number[];
}

export class UpdateShippingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  deliveryEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  freeShippingFromCents?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pickupEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(240)
  pickupAddress?: string | null;

  @ApiPropertyOptional({ example: '150132', description: 'INEI district the couriers pick up from' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^\d{6}$/, { message: 'Elige el distrito desde donde despachas.' })
  shippingOriginUbigeo?: string | null;

  @ApiPropertyOptional({ type: CarrierRatesDto, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ValidateNested()
  @Type(() => CarrierRatesDto)
  carrierRates?: CarrierRatesDto | null;
}
