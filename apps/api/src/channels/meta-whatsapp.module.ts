import { Module } from '@nestjs/common';
import { MetaWhatsAppClient } from './meta-whatsapp.client';

@Module({
  providers: [MetaWhatsAppClient],
  exports: [MetaWhatsAppClient],
})
export class MetaWhatsAppModule {}
