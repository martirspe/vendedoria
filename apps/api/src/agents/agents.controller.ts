import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { AgentsService } from './agents.service';
import { UpdateSalesAgentDto } from './dto/update-sales-agent.dto';

@ApiTags('agents')
@ApiBearerAuth()
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get('primary')
  getPrimary(@CurrentUser() user: AuthUserPayload) {
    return this.agentsService.getPrimary(user.tenantId);
  }

  @Patch('primary')
  updatePrimary(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: UpdateSalesAgentDto,
  ) {
    return this.agentsService.updatePrimary(user.tenantId, dto);
  }
}
