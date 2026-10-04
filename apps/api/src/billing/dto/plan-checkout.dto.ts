import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanTier } from '@prisma/client';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

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

/** Card or Yape token created in the console with the platform public key. */
export class PayPlanDto {
  @ApiProperty({ enum: ['card', 'yape'] })
  @IsIn(['card', 'yape'])
  method!: 'card' | 'yape';

  @ApiProperty({ description: 'Card or Yape token from Mercado Pago SDK' })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  cardToken!: string;

  @ApiPropertyOptional({ example: 'visa' })
  @ValidateIf((o: PayPlanDto) => o.method === 'card')
  @Matches(/^[a-z_]{2,40}$/)
  paymentMethodId?: string;

  @ApiPropertyOptional({ enum: ['credit_card', 'debit_card', 'prepaid_card'] })
  @ValidateIf((o: PayPlanDto) => o.method === 'card')
  @IsIn(['credit_card', 'debit_card', 'prepaid_card'])
  paymentType?: string;

  @ApiPropertyOptional({ description: 'Yape phone, 9 digits (test number 111111111)' })
  @ValidateIf((o: PayPlanDto) => o.method === 'yape')
  @Matches(/^\d{9}$/)
  phone?: string;

  @ApiPropertyOptional({ description: 'Payer email typed in the card form; defaults to the user email' })
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  payerEmail?: string;

  @ApiPropertyOptional({ enum: ['DNI', 'CE', 'RUC'] })
  @IsOptional()
  @IsIn(['DNI', 'CE', 'RUC'])
  identificationType?: 'DNI' | 'CE' | 'RUC';

  @ApiPropertyOptional()
  @ValidateIf((o: PayPlanDto) => o.identificationType !== undefined)
  @Matches(/^\d{8,12}$/)
  identificationNumber?: string;
}
