import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentUser, Public } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { ChannelsService } from './channels.service';
import { WhatsAppSignupService } from './whatsapp-signup.service';
import { WhatsAppManualService } from './whatsapp-manual.service';
import { ConnectWhatsAppManualDto } from './dto/whatsapp-manual.dto';
import { AuthorizeWhatsAppSignupDto, CompleteWhatsAppSignupDto, WhatsAppSignupStateDto } from './dto/whatsapp-signup.dto';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { assertManager } from '../common/roles';
import {
  ConnectInstagramDto,
  SimulateInboundDto,
} from './dto/channels.dto';

@ApiTags('channels')
@Controller()
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService, private readonly signup: WhatsAppSignupService, private readonly manual: WhatsAppManualService) {}

  @ApiBearerAuth()
  @Post(['channels/whatsapp/manual/connect', 'channels/whatsapp/connect'])
  @RateLimit('whatsapp-manual-connect', 10)
  connectManual(@CurrentUser() user: AuthUserPayload, @Body() dto: ConnectWhatsAppManualDto, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('Cache-Control', 'no-store');
    return this.manual.connect(user, dto);
  }

  @ApiBearerAuth()
  @Get('channels/whatsapp/manual/:channelId/setup')
  manualSetup(@CurrentUser() user: AuthUserPayload, @Param('channelId') id: string, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('Cache-Control', 'no-store');
    return this.manual.getSetup(user, id);
  }

  @ApiBearerAuth()
  @Post('channels/whatsapp/manual/:channelId/activate')
  @RateLimit('whatsapp-manual-activate', 10)
  activateManual(@CurrentUser() user: AuthUserPayload, @Param('channelId') id: string) { return this.manual.activate(user, id); }

  @Public()
  @Get('webhooks/meta/whatsapp/manual/:channelId')
  @RateLimit('whatsapp-manual-verify', 60)
  async verifyManualWebhook(@Param('channelId') id: string, @Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string, @Res() reply: FastifyReply) {
    const result = await this.manual.verifyWebhook(id, mode, token, challenge);
    return reply.type('text/plain').code(200).send(result);
  }

  @Public()
  @Post('webhooks/meta/whatsapp/manual/:channelId')
  @RateLimit('whatsapp-manual-webhook', 600)
  receiveManualWebhook(@Param('channelId') id: string, @Body() body: Record<string, unknown>, @Req() request: RawBodyRequest<FastifyRequest>, @Headers('x-hub-signature-256') signature?: string) {
    return this.manual.receiveWebhook(id, request.rawBody, signature, body as Parameters<ChannelsService['handleMetaWebhook']>[0]);
  }

  @ApiBearerAuth()
  @Get('channels/whatsapp/signup/config')
  signupConfiguration(@CurrentUser() user: AuthUserPayload) { return this.signup.configuration(user); }

  @ApiBearerAuth()
  @Post('channels/whatsapp/signup/start')
  @RateLimit('whatsapp-signup', 10)
  startSignup(@CurrentUser() user: AuthUserPayload) { return this.signup.start(user); }

  @ApiBearerAuth()
  @Post('channels/whatsapp/signup/authorize')
  @RateLimit('whatsapp-signup-authorize', 10)
  authorizeSignup(@CurrentUser() user: AuthUserPayload, @Body() dto: AuthorizeWhatsAppSignupDto) { return this.signup.authorize(user, dto); }

  @ApiBearerAuth()
  @Post('channels/whatsapp/signup/complete')
  @RateLimit('whatsapp-signup-complete', 10)
  completeSignup(@CurrentUser() user: AuthUserPayload, @Body() dto: CompleteWhatsAppSignupDto) { return this.signup.complete(user, dto); }

  @ApiBearerAuth()
  @Post('channels/whatsapp/signup/cancel')
  cancelSignup(@CurrentUser() user: AuthUserPayload, @Body() dto: WhatsAppSignupStateDto) { return this.signup.cancel(user, dto); }

  @ApiBearerAuth()
  @Post('channels/whatsapp/:channelId/disconnect')
  @RateLimit('whatsapp-disconnect', 10)
  disconnectWhatsApp(@CurrentUser() user: AuthUserPayload, @Param('channelId') channelId: string) { return this.signup.disconnect(user, channelId); }

  @ApiBearerAuth()
  @Get('channels')
  list(@CurrentUser() user: AuthUserPayload) {
    return this.channelsService.list(user.tenantId);
  }

  @ApiBearerAuth()
  @Get('channels/whatsapp/diagnostics')
  whatsappDiagnostics(@CurrentUser() user: AuthUserPayload) {
    return this.signup.diagnostics(user);
  }

  @ApiBearerAuth()
  @Get('channels/instagram')
  instagramStatus(@CurrentUser() user: AuthUserPayload) {
    return this.channelsService.getInstagramStatus(user.tenantId);
  }

  @ApiBearerAuth()
  @Post('channels/instagram/connect')
  connectInstagram(@CurrentUser() user: AuthUserPayload, @Body() dto: ConnectInstagramDto) {
    return this.channelsService.connectInstagram(user, dto);
  }

  @ApiBearerAuth()
  @Post('channels/:channelId/disconnect')
  async disconnect(
    @CurrentUser() user: AuthUserPayload,
    @Param('channelId') channelId: string,
  ) {
    assertManager(user, 'Solo el dueño o un administrador puede desconectar canales.');
    const channel = (await this.channelsService.list(user.tenantId)).find(item => item.id === channelId);
    if (channel?.type === 'WHATSAPP') return this.signup.disconnect(user, channelId);
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
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    this.channelsService.assertMetaSignature(request.rawBody, signature);
    return this.channelsService.handleMetaWebhook(
      body as Parameters<ChannelsService['handleMetaWebhook']>[0],
    );
  }

  @Public()
  @Get('webhooks/meta/instagram')
  verifyInstagramWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() reply: FastifyReply,
  ) {
    const result = this.channelsService.verifyMetaWebhook(mode, token, challenge);
    return reply.type('text/plain').code(200).send(result);
  }

  @Public()
  @Post('webhooks/meta/instagram')
  async receiveInstagramWebhook(
    @Body() body: Record<string, unknown>,
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    this.channelsService.assertInstagramSignature(request.rawBody, signature);
    return this.channelsService.handleInstagramWebhook(
      body as Parameters<ChannelsService['handleInstagramWebhook']>[0],
    );
  }
}
