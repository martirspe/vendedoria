import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingWebhookController } from './billing-webhook.controller';
import { PlanLimitsService } from './plan-limits.service';

@Module({
  imports: [PaymentsModule],
  controllers: [BillingController, BillingWebhookController],
  providers: [BillingService, PlanLimitsService],
  exports: [BillingService, PlanLimitsService],
})
export class BillingModule {}
