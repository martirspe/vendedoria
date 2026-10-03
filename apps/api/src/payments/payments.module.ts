import { Module } from '@nestjs/common';
import { OrderNotificationsModule } from '../orders/order-notifications.module';
import { MerchantAccountsService } from './merchant-accounts.service';
import { MercadoPagoPaymentProvider } from './mercadopago.provider';
import { MockPaymentProvider } from './mock-payment.provider';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [OrderNotificationsModule],
  controllers: [PaymentsController],
  providers: [
    MerchantAccountsService,
    MockPaymentProvider,
    MercadoPagoPaymentProvider,
    PaymentsService,
  ],
  exports: [PaymentsService, MerchantAccountsService, MercadoPagoPaymentProvider],
})
export class PaymentsModule {}
