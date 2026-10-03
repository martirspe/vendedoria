import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanTier } from '@prisma/client';
import { IsIn, IsInt, IsOptional, Matches } from 'class-validator';

export class CreatePlanCheckoutDto {
  @ApiPropertyOptional({
    enum: ['START', 'GROW', 'SCALE', 'LEAD'],
    description: 'Plan to pay. Send either planTier or chatPackSize.',
  })
  @IsOptional()
  @IsIn(['START', 'GROW', 'SCALE', 'LEAD'])
  planTier?: PlanTier;

  @ApiPropertyOptional({ enum: [1, 3, 6, 12], default: 1, description: 'Months paid in advance with planTier.' })
  @IsOptional()
  @IsInt()
  @IsIn([1, 3, 6, 12])
  months?: number;

  @ApiPropertyOptional({ enum: [100, 500, 1000], description: 'Extra new chats for the current month.' })
  @IsOptional()
  @IsInt()
  @IsIn([100, 500, 1000])
  chatPackSize?: number;
}

export class ConfirmPlanPaymentDto {
  /** `payment_id` that Mercado Pago appends to the return URL. */
  @ApiProperty({ example: '1234567890' })
  @Matches(/^\d{1,20}$/)
  providerPaymentId!: string;
}
