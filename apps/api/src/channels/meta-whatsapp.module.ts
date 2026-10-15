import { Module } from '@nestjs/common';
import { ChannelMessengerService } from './channel-messenger.service';
import { MetaInstagramClient } from './meta-instagram.client';
import { MetaWhatsAppClient } from './meta-whatsapp.client';
import { ChannelCredentialsService } from './channel-credentials.service';

@Module({
  providers: [MetaWhatsAppClient, MetaInstagramClient, ChannelMessengerService, ChannelCredentialsService],
  exports: [MetaWhatsAppClient, MetaInstagramClient, ChannelMessengerService, ChannelCredentialsService],
})
export class MetaWhatsAppModule {}
