import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { SalesEngineOpsService } from './sales-engine-ops.service';

class SalesBackfillDto {
  @IsIn(['product', 'faq']) documentType!: 'product' | 'faq';
  @IsOptional() @IsString() @MaxLength(100) after?: string;
}

@ApiTags('agent-engine')
@ApiBearerAuth()
@Controller('agent-engine')
export class SalesEngineController {
  constructor(private readonly operations: SalesEngineOpsService) {}
  @Post('backfill')
  @RateLimit('sales-backfill', 30)
  backfill(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: SalesBackfillDto,
  ) {
    return this.operations.backfill(user.tenantId, dto.documentType, dto.after);
  }
  @Get('conversations/:conversationId')
  diagnose(
    @CurrentUser() user: AuthUserPayload,
    @Param('conversationId') conversationId: string,
  ) {
    return this.operations.diagnose(user.tenantId, conversationId);
  }
  @Get('metrics')
  metrics(@CurrentUser() user: AuthUserPayload) {
    return this.operations.metrics(user.tenantId);
  }
}
