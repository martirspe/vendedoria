import { Module } from '@nestjs/common';
import { ConversionInfrastructure } from './conversion-infrastructure.service';

/** Shared operational Redis connection for conversion and sales runtimes. */
@Module({
  providers: [ConversionInfrastructure],
  exports: [ConversionInfrastructure],
})
export class ConversionInfrastructureModule {}
