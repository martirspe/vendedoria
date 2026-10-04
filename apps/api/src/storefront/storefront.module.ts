import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CatalogModule } from '../catalog/catalog.module';
import { PaymentsModule } from '../payments/payments.module';
import { TurnstileModule } from '../turnstile/turnstile.module';
import { StorefrontAiService } from './storefront-ai.service';
import { StorefrontEditorService } from './storefront-editor.service';
import { StorefrontPublicController } from './storefront-public.controller';
import { StorefrontPublicService } from './storefront-public.service';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';

@Module({
  imports: [PaymentsModule, TurnstileModule, CatalogModule, BillingModule],
  controllers: [StorefrontController, StorefrontPublicController],
  providers: [StorefrontService, StorefrontPublicService, StorefrontEditorService, StorefrontAiService],
  exports: [StorefrontService, StorefrontPublicService],
})
export class StorefrontModule {}
