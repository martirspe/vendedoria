import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { AgentsService } from './agents.service';
import { PlaygroundService } from './playground.service';
import { UpdateSalesAgentDto } from './dto/update-sales-agent.dto';
import {
  CreatePlaygroundSessionDto,
  SendPlaygroundMessageDto,
} from './dto/playground.dto';

@ApiTags('agents')
@ApiBearerAuth()
@Controller('agents')
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly playgroundService: PlaygroundService,
  ) {}

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

  @Get('playground/session')
  getPlaygroundSession(@CurrentUser() user: AuthUserPayload) {
    return this.playgroundService.getLatestOrCreate(user.tenantId);
  }

  @Post('playground/sessions')
  createPlaygroundSession(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: CreatePlaygroundSessionDto,
  ) {
    return this.playgroundService.createSession(user.tenantId, dto.title);
  }

  @Get('playground/sessions/:sessionId')
  getPlaygroundSessionById(
    @CurrentUser() user: AuthUserPayload,
    @Param('sessionId') sessionId: string,
  ) {
    return this.playgroundService.getSession(user.tenantId, sessionId);
  }

  @Post('playground/sessions/:sessionId/reset')
  resetPlaygroundSession(
    @CurrentUser() user: AuthUserPayload,
    @Param('sessionId') sessionId: string,
  ) {
    return this.playgroundService.resetSession(user.tenantId, sessionId);
  }

  @Post('playground/sessions/:sessionId/messages')
  sendPlaygroundMessage(
    @CurrentUser() user: AuthUserPayload,
    @Param('sessionId') sessionId: string,
    @Body() dto: SendPlaygroundMessageDto,
  ) {
    return this.playgroundService.sendMessage(
      user.tenantId,
      sessionId,
      dto.text,
    );
  }
}
