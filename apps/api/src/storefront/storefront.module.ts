import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { StorefrontPublicController } from './storefront-public.controller';
import { StorefrontPublicService } from './storefront-public.service';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';

@Module({
  imports: [PaymentsModule],
  controllers: [StorefrontController, StorefrontPublicController],
  providers: [StorefrontService, StorefrontPublicService],
  exports: [StorefrontService, StorefrontPublicService],
})
export class StorefrontModule {}
