import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { PlanLimitsService } from './plan-limits.service';
import { BillingService } from './billing.service';
import { ConfirmPlanPaymentDto, CreatePlanCheckoutDto } from './dto/plan-checkout.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

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

  /** Only moves back to FREE; paid plans are granted by a confirmed payment. */
  @Patch('plan')
  updatePlan(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.billingService.updatePlan(user, dto.planTier);
  }

  @Post('checkout')
  createCheckout(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: CreatePlanCheckoutDto,
  ) {
    return this.billingService.createCheckout(user, dto.planTier);
  }

  @Post('checkout/confirm')
  @HttpCode(200)
  confirm(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: ConfirmPlanPaymentDto,
  ) {
    return this.billingService.confirmReturn(user, dto.providerPaymentId);
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
