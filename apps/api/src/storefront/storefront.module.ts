import { Module } from '@nestjs/common';
import { StorefrontPublicController } from './storefront-public.controller';
import { StorefrontPublicService } from './storefront-public.service';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';

@Module({
  controllers: [StorefrontController, StorefrontPublicController],
  providers: [StorefrontService, StorefrontPublicService],
  exports: [StorefrontService],
})
export class StorefrontModule {}
