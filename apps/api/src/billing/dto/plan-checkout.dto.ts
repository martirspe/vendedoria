import { ApiProperty } from '@nestjs/swagger';
import { PlanTier } from '@prisma/client';
import { IsIn, Matches } from 'class-validator';

export class CreatePlanCheckoutDto {
  @ApiProperty({ enum: ['STARTER', 'PRO'] })
  @IsIn(['STARTER', 'PRO'])
  planTier!: PlanTier;
}

export class ConfirmPlanPaymentDto {
  /** `payment_id` that Mercado Pago appends to the return URL. */
  @ApiProperty({ example: '1234567890' })
  @Matches(/^\d{1,20}$/)
  providerPaymentId!: string;
}
