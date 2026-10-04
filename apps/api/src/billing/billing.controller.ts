import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { PlanLimitsService } from './plan-limits.service';
import { BillingService } from './billing.service';
import { CreatePlanCheckoutDto, PayPlanDto } from './dto/plan-checkout.dto';
@ApiTags('billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  @Get('plans')
  getPlans(@CurrentUser() user: AuthUserPayload) {
    return this.billingService.getOverview(user.tenantId);
  }

  @Get('usage')
  getUsage(@CurrentUser() user: AuthUserPayload) {
    return this.planLimits.getUsage(user.tenantId);
  }

  /** Plans are only granted by a confirmed payment. */
  @Post('checkout')
  createCheckout(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: CreatePlanCheckoutDto,
  ) {
    return this.billingService.createCheckout(user, dto);
  }

  @Post('payments/:paymentId/pay')
  @HttpCode(200)
  pay(
    @CurrentUser() user: AuthUserPayload,
    @Param('paymentId') paymentId: string,
    @Body() dto: PayPlanDto,
  ) {
    return this.billingService.pay(user, paymentId, dto);
  }

  @Get('payments/:paymentId')
  status(
    @CurrentUser() user: AuthUserPayload,
    @Param('paymentId') paymentId: string,
  ) {
    return this.billingService.paymentStatus(user, paymentId);
  }

  @Post('payments/:paymentId/simulate')
  @HttpCode(200)
  simulate(
    @CurrentUser() user: AuthUserPayload,
    @Param('paymentId') paymentId: string,
  ) {
    return this.billingService.simulatePayment(user, paymentId);
  }
}
