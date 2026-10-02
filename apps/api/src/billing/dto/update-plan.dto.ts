import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PlanTier } from '@prisma/client';

export class UpdatePlanDto {
  @ApiProperty({ enum: ['FREE', 'STARTER', 'PRO', 'BUSINESS'] })
  @IsIn(['FREE', 'STARTER', 'PRO', 'BUSINESS'])
  planTier!: PlanTier;
}
