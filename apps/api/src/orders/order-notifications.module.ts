import { Module } from '@nestjs/common';
import { MetaWhatsAppModule } from '../channels/meta-whatsapp.module';
import { OrderNotificationsService } from './order-notifications.service';

/** Own module so payments and orders can notify buyers without importing each other. */
@Module({
  imports: [MetaWhatsAppModule],
  providers: [OrderNotificationsService],
  exports: [OrderNotificationsService],
})
export class OrderNotificationsModule {}
