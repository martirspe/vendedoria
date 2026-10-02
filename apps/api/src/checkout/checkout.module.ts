import { Module } from '@nestjs/common';
import { CouponsModule } from '../coupons/coupons.module';
import { PaymentsModule } from '../payments/payments.module';
import { StorefrontModule } from '../storefront/storefront.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { MercadoPagoWebhookController } from './mercadopago-webhook.controller';
import { OrderEmailService } from './order-email.service';

@Module({
  imports: [PaymentsModule, CouponsModule, StorefrontModule],
  controllers: [CheckoutController, MercadoPagoWebhookController],
  providers: [CheckoutService, OrderEmailService],
  exports: [CheckoutService, OrderEmailService],
})
export class CheckoutModule {}
