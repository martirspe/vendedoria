import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
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
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const SHIPPING_MODES = ['OLVA', 'SHALOM', 'PICKUP'] as const;

export class CheckoutItemDto {
  @ApiProperty({ example: 'polo-algodon' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  handle!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  variantId?: string;

  @ApiProperty({ minimum: 1, maximum: 20 })
  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;
}

export class CouponPreviewDto {
  @ApiProperty({ type: [CheckoutItemDto] })
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  items!: CheckoutItemDto[];

  @ApiProperty({ example: 'VERANO10' })
  @IsString()
  @MaxLength(40)
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({ enum: SHIPPING_MODES, description: 'Chosen delivery, to validate free shipping coupons' })
  @IsOptional()
  @IsIn(SHIPPING_MODES)
  mode?: (typeof SHIPPING_MODES)[number];
}

export class CheckoutCustomerDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name!: string;

  @ApiProperty()
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @ApiProperty({ example: '987654321', description: 'Peruvian mobile, 9 digits' })
  @Matches(/^9\d{8}$/, { message: 'Ingresa un celular de 9 dígitos que empiece con 9.' })
  phone!: string;

  @ApiPropertyOptional({ description: 'DNI (8) or CE (9-12)' })
  @IsOptional()
  @Matches(/^\d{8,12}$/, { message: 'El documento debe tener entre 8 y 12 dígitos.' })
  document?: string;
}

export class CheckoutDeliveryDto {
  @ApiProperty({ enum: SHIPPING_MODES })
  @IsIn(SHIPPING_MODES)
  mode!: (typeof SHIPPING_MODES)[number];

  @ApiPropertyOptional()
  @ValidateIf((o: CheckoutDeliveryDto) => o.mode !== 'PICKUP')
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  address?: string;

  @ApiPropertyOptional({ example: '150122', description: 'INEI district code (ubigeo) for home delivery' })
  @ValidateIf((o: CheckoutDeliveryDto) => o.mode !== 'PICKUP')
  @Matches(/^\d{6}$/, { message: 'Selecciona el departamento, la provincia y el distrito.' })
  ubigeo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  reference?: string;

  @ApiPropertyOptional({ description: 'Required for OLVA/SHALOM: accepts the reference rate' })
  @IsOptional()
  @IsBoolean()
  acknowledgeRate?: boolean;
}

export class ShippingQuoteQueryDto {
  @ApiProperty({ example: '150122' })
  @Matches(/^\d{6}$/, { message: 'Selecciona un distrito válido.' })
  ubigeo!: string;
}

export class CreateCheckoutDto {
  @ApiProperty({ description: 'Client generated UUID; retries with the same key return the same order' })
  @IsUUID()
  checkoutKey!: string;

  @ApiProperty({ type: [CheckoutItemDto] })
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  items!: CheckoutItemDto[];

  @ApiProperty({ type: CheckoutCustomerDto })
  @ValidateNested()
  @Type(() => CheckoutCustomerDto)
  customer!: CheckoutCustomerDto;

  @ApiProperty({ type: CheckoutDeliveryDto })
  @ValidateNested()
  @Type(() => CheckoutDeliveryDto)
  delivery!: CheckoutDeliveryDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  couponCode?: string;

  @ApiProperty({ description: 'Accepted terms and privacy policy' })
  @Equals(true, { message: 'Debes aceptar los términos y la política de privacidad.' })
  acceptTerms!: boolean;
}

export class OrderAccessDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{20,80}$/)
  token!: string;
}

export class PayOrderDto extends OrderAccessDto {
  @ApiProperty({ description: 'Client generated UUID for this payment attempt' })
  @IsUUID()
  paymentKey!: string;

  @ApiProperty({ enum: ['card', 'yape'] })
  @IsIn(['card', 'yape'])
  method!: 'card' | 'yape';

  @ApiProperty({ description: 'Card or Yape token from Mercado Pago SDK' })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  cardToken!: string;

  @ApiPropertyOptional({ example: 'visa' })
  @ValidateIf((o: PayOrderDto) => o.method === 'card')
  @Matches(/^[a-z_]{2,40}$/)
  paymentMethodId?: string;

  @ApiPropertyOptional({ enum: ['credit_card', 'debit_card', 'prepaid_card'] })
  @ValidateIf((o: PayOrderDto) => o.method === 'card')
  @IsIn(['credit_card', 'debit_card', 'prepaid_card'])
  paymentType?: string;

  @ApiPropertyOptional({ description: 'Yape phone, 9 digits (test number 111111111)' })
  @ValidateIf((o: PayOrderDto) => o.method === 'yape')
  @Matches(/^\d{9}$/)
  phone?: string;

  @ApiPropertyOptional({ enum: ['DNI', 'CE'] })
  @IsOptional()
  @IsIn(['DNI', 'CE'])
  identificationType?: 'DNI' | 'CE';

  @ApiPropertyOptional()
  @ValidateIf((o: PayOrderDto) => o.identificationType !== undefined)
  @Matches(/^\d{8,12}$/)
  identificationNumber?: string;
}
