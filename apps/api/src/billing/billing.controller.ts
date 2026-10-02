import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { PlanLimitsService } from './plan-limits.service';
import { BillingService } from './billing.service';
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

  @Patch('plan')
  updatePlan(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.billingService.updatePlan(user.tenantId, dto.planTier);
  }
}
