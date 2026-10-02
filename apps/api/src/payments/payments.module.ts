import { Module } from '@nestjs/common';
import { MerchantAccountsService } from './merchant-accounts.service';
import { MercadoPagoPaymentProvider } from './mercadopago.provider';
import { MockPaymentProvider } from './mock-payment.provider';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [PaymentsController],
  providers: [
    MerchantAccountsService,
    MockPaymentProvider,
    MercadoPagoPaymentProvider,
    PaymentsService,
  ],
  exports: [PaymentsService, MerchantAccountsService],
})
export class PaymentsModule {}
