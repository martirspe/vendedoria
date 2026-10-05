import { Module } from '@nestjs/common';
import { ConversionInfrastructureModule } from '../conversion/conversion-infrastructure.module';
import { SalesConversationLock } from './sales-lock.service';
import { SalesMemoryService } from './sales-memory.service';
import { SalesSearchService } from './sales-search.service';

@Module({
  imports: [ConversionInfrastructureModule],
  providers: [SalesConversationLock, SalesMemoryService, SalesSearchService],
  exports: [
    SalesConversationLock,
    SalesMemoryService,
    SalesSearchService,
    ConversionInfrastructureModule,
  ],
})
export class SalesInfrastructureModule {}
