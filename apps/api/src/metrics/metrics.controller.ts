import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@ApiBearerAuth()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('summary')
  summary(
    @CurrentUser() user: AuthUserPayload,
    @Query('days') days?: string,
  ) {
    const parsed = Number(days);
    return this.metricsService.summary(
      user.tenantId,
      Number.isFinite(parsed) ? parsed : 7,
    );
  }
}
