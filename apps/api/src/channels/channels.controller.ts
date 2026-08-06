import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { CurrentUser, Public } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { ChannelsService } from './channels.service';
import {
  ConnectWhatsAppDto,
  SimulateInboundDto,
} from './dto/channels.dto';

@ApiTags('channels')
@Controller()
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @ApiBearerAuth()
  @Get('channels')
  list(@CurrentUser() user: AuthUserPayload) {
    return this.channelsService.list(user.tenantId);
  }

  @ApiBearerAuth()
  @Post('channels/whatsapp/connect')
  connectWhatsApp(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: ConnectWhatsAppDto,
  ) {
    return this.channelsService.connectWhatsApp(user.tenantId, dto);
  }

  @ApiBearerAuth()
  @Post('channels/:channelId/disconnect')
  disconnect(
    @CurrentUser() user: AuthUserPayload,
    @Param('channelId') channelId: string,
  ) {
    return this.channelsService.markDisconnected(user.tenantId, channelId);
  }

  @ApiBearerAuth()
  @Post('channels/whatsapp/simulate-inbound')
  simulateInbound(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: SimulateInboundDto,
  ) {
    return this.channelsService.simulateInbound(user.tenantId, dto);
  }

  @Public()
  @Get('webhooks/meta/whatsapp')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() reply: FastifyReply,
  ) {
    const result = this.channelsService.verifyMetaWebhook(
      mode,
      token,
      challenge,
    );
    return reply.type('text/plain').code(200).send(result);
  }

  @Public()
  @Post('webhooks/meta/whatsapp')
  async receiveWebhook(
    @Body() body: Record<string, unknown>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    this.channelsService.assertMetaSignature(JSON.stringify(body), signature);
    return this.channelsService.handleMetaWebhook(
      body as Parameters<ChannelsService['handleMetaWebhook']>[0],
    );
  }
}
