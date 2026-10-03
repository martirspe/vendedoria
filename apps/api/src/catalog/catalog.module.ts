import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CatalogController, MediaController } from './catalog.controller';
import { CatalogImportService } from './catalog-import.service';
import { CatalogService } from './catalog.service';
import { MediaService } from './media.service';

@Module({
  imports: [BillingModule],
  controllers: [CatalogController, MediaController],
  providers: [CatalogService, CatalogImportService, MediaService],
  exports: [MediaService],
})
export class CatalogModule {}
