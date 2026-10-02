import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PlanLimitsService } from './plan-limits.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, PlanLimitsService],
  exports: [BillingService, PlanLimitsService],
})
export class BillingModule {}
