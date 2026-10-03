import { Module } from '@nestjs/common';
import { ChannelMessengerService } from './channel-messenger.service';
import { MetaInstagramClient } from './meta-instagram.client';
import { MetaWhatsAppClient } from './meta-whatsapp.client';

@Module({
  providers: [MetaWhatsAppClient, MetaInstagramClient, ChannelMessengerService],
  exports: [MetaWhatsAppClient, MetaInstagramClient, ChannelMessengerService],
})
export class MetaWhatsAppModule {}
