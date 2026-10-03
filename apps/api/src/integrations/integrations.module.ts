import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CloudflareSaasClient } from './cloudflare-saas.client';
import { CustomDomainService } from './custom-domain.service';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [BillingModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, CustomDomainService, CloudflareSaasClient],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
