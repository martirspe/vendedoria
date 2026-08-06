import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { MetaWhatsAppModule } from './meta-whatsapp.module';

@Module({
  imports: [MetaWhatsAppModule, ConversationsModule],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
