import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MercadoPagoPaymentProvider } from './mercadopago.provider';
import { MockPaymentProvider } from './mock-payment.provider';
import { PAYMENT_PROVIDER } from './payment-provider.port';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [ConfigModule],
  controllers: [PaymentsController],
  providers: [
    MockPaymentProvider,
    MercadoPagoPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService, MockPaymentProvider, MercadoPagoPaymentProvider],
      useFactory: (
        config: ConfigService,
        mock: MockPaymentProvider,
        mercadoPago: MercadoPagoPaymentProvider,
      ) => {
        const token = config.get<string>('MERCADOPAGO_ACCESS_TOKEN');
        return token ? mercadoPago : mock;
      },
    },
    PaymentsService,
  ],
  exports: [PaymentsService, PAYMENT_PROVIDER],
})
export class PaymentsModule {}
