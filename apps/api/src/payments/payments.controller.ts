import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { ConnectPaymentAccountDto } from './dto/payment-account.dto';
import { MerchantAccountsService } from './merchant-accounts.service';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly accounts: MerchantAccountsService,
  ) {}

  @ApiBearerAuth()
  @Get('payments/provider')
  getProvider(@CurrentUser() user: AuthUserPayload) {
    return this.paymentsService.providerStatus(user.tenantId);
  }

  @ApiBearerAuth()
  @Get('payments/account')
  getAccount(@CurrentUser() user: AuthUserPayload) {
    return this.accounts.view(user.tenantId);
  }

  @ApiBearerAuth()
  @Put('payments/account')
  connectAccount(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: ConnectPaymentAccountDto,
  ) {
    return this.accounts.connect(user, dto);
  }

  @ApiBearerAuth()
  @Delete('payments/account')
  disconnectAccount(@CurrentUser() user: AuthUserPayload) {
    return this.accounts.disconnect(user);
  }

  @Public()
  @Get('payments/mock-checkout/:paymentId')
  mockCheckout(@Param('paymentId') paymentId: string) {
    return this.paymentsService.getMockCheckoutPage(paymentId);
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
