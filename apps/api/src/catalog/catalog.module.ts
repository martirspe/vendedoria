import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [BillingModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
