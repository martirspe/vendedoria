import { Body, Controller, Get, Headers, Inject, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { CurrentUser, Public } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import {
  PAYMENT_PROVIDER,
  PaymentProviderPort,
} from './payment-provider.port';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly config: ConfigService,
    @Inject(PAYMENT_PROVIDER)
    private readonly provider: PaymentProviderPort,
  ) {}

  @ApiBearerAuth()
  @Get('payments/provider')
  getProvider() {
    return {
      provider: this.paymentsService.getProviderName(),
      mockMode: this.provider.name === 'mock',
      configured: Boolean(
        this.config.get<string>('MERCADOPAGO_ACCESS_TOKEN'),
      ),
    };
  }

  @Public()
  @Get('payments/mock-checkout/:paymentId')
  mockCheckout(@Param('paymentId') paymentId: string) {
    return this.paymentsService.getMockCheckoutPage(paymentId);
  }

  @Public()
  @Post('webhooks/payments/:provider')
  webhook(
    @Param('provider') provider: string,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | undefined>,
  ) {
    return this.paymentsService.handleWebhook(provider, body, headers);
  }

  @ApiBearerAuth()
  @Post('payments/:paymentId/simulate')
  simulate(
    @CurrentUser() user: AuthUserPayload,
    @Param('paymentId') paymentId: string,
  ) {
    return this.paymentsService.simulateMockPayment(user.tenantId, paymentId);
  }
}
