import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrderItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiProperty({ example: 'Polo básico' })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ example: 8900, description: 'Unit price in cents' })
  @IsInt()
  @Min(0)
  unitCents!: number;
}

export class CreateOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional({ example: 'PEN' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @ApiPropertyOptional({
    description: 'Create Mercado Pago (or mock) payment link after order',
  })
  @IsOptional()
  @IsBoolean()
  createPaymentLink?: boolean;

  @ApiPropertyOptional({
    description: 'Post the payment link into the linked conversation',
  })
  @IsOptional()
  @IsBoolean()
  sendLinkToChat?: boolean;
}

export class UpdateOrderStatusDto {
  @ApiProperty({
    enum: [
      'DRAFT',
      'PENDING_PAYMENT',
      'PAID',
      'FULFILLING',
      'SHIPPED',
      'COMPLETED',
      'CANCELLED',
    ],
  })
  @IsString()
  @IsIn([
    'DRAFT',
    'PENDING_PAYMENT',
    'PAID',
    'FULFILLING',
    'SHIPPED',
    'COMPLETED',
    'CANCELLED',
  ])
  status!:
    | 'DRAFT'
    | 'PENDING_PAYMENT'
    | 'PAID'
    | 'FULFILLING'
    | 'SHIPPED'
    | 'COMPLETED'
    | 'CANCELLED';
}

export class CreatePaymentLinkDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sendLinkToChat?: boolean;
}
