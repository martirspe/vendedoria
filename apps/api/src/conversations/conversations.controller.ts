import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  Patch,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChannelType } from '@prisma/client';
import { Observable } from 'rxjs';
import { CurrentUser } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { ConversationsService } from './conversations.service';
import { InboxEventsService } from './inbox-events.service';
import {
  SendMessageDto,
  SendTemplateDto,
  UpdateConversationDto,
} from './dto/conversations.dto';

@ApiTags('conversations')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly inboxEvents: InboxEventsService,
  ) {}

  @Sse('stream')
  @ApiOperation({
    summary: 'Inbox change stream (Server-Sent Events): `inbox` events carry conversation ids only',
  })
  stream(@CurrentUser() user: AuthUserPayload): Observable<MessageEvent> {
    return this.inboxEvents.stream(user.tenantId);
  }

  @Get('templates')
  listTemplates() {
    return this.conversationsService.listTemplates();
  }

  @Get()
  list(
    @CurrentUser() user: AuthUserPayload,
    @Query('channelType') channelType?: ChannelType,
    @Query('unattended') unattended?: string,
    @Query('salesOnly') salesOnly?: string,
    @Query('q') q?: string,
  ) {
    return this.conversationsService.list(user.tenantId, {
      channelType,
      unattended: unattended === 'true',
      salesOnly: salesOnly === 'true',
      q,
    });
  }

  @Get(':conversationId')
  getById(
    @CurrentUser() user: AuthUserPayload,
    @Param('conversationId') conversationId: string,
  ) {
    return this.conversationsService.getById(user.tenantId, conversationId);
  }

  @Patch(':conversationId')
  update(
    @CurrentUser() user: AuthUserPayload,
    @Param('conversationId') conversationId: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversationsService.updateFlags(
      user.tenantId,
      conversationId,
      dto,
    );
  }

  @Post(':conversationId/messages')
  sendMessage(
    @CurrentUser() user: AuthUserPayload,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.conversationsService.sendOperatorMessage(
      user.tenantId,
      conversationId,
      dto.text,
    );
  }

  @Post(':conversationId/templates')
  sendTemplate(
    @CurrentUser() user: AuthUserPayload,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendTemplateDto,
  ) {
    return this.conversationsService.sendOperatorTemplate(
      user.tenantId,
      conversationId,
      dto.templateId,
      dto.variables ?? [],
    );
  }
}
