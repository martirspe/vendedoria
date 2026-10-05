import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  Sse,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { CurrentUser, Public } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import {
  CurrentLiveProductDto,
  LiveCampaignDto,
  LiveMessageDto,
  LiveSettingsDto,
  ReserveLiveDto,
  TikTokCallbackDto,
} from './dto/live.dto';
import { LiveService } from './live.service';
import { TikTokIntegrationService } from './tiktok-integration.service';

const COOKIE = 'tiktok_oauth_state';
const COOKIE_PATH = '/api/v1/integrations/tiktok-live/oauth/callback';

@ApiTags('tiktok-live')
@ApiBearerAuth()
@Controller('integrations/tiktok-live')
export class TikTokIntegrationController {
  constructor(
    private readonly integration: TikTokIntegrationService,
    private readonly config: ConfigService,
  ) {}
  @Get() view(@CurrentUser() user: AuthUserPayload) {
    return this.integration.view(user.tenantId);
  }
  @Put() settings(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: LiveSettingsDto,
  ) {
    return this.integration.settings(user, dto);
  }
  @Post('connect')
  @HttpCode(200)
  async connect(
    @CurrentUser() user: AuthUserPayload,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { state, url } = await this.integration.begin(user);
    reply.header(
      'Set-Cookie',
      `${COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Path=${COOKIE_PATH}; Max-Age=600`,
    );
    reply.header('Cache-Control', 'no-store');
    return { url };
  }
  @Post('verify') @HttpCode(200) verify(@CurrentUser() user: AuthUserPayload) {
    return this.integration.verify(user);
  }
  @Delete('connection') disconnect(@CurrentUser() user: AuthUserPayload) {
    return this.integration.disconnect(user);
  }
  @Public()
  @Get('oauth/callback')
  @RateLimit('tiktok-oauth', 20)
  async callback(
    @Query() dto: TikTokCallbackDto,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');
    const cookie = req.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    const a = Buffer.from(cookie ?? '');
    const b = Buffer.from(dto.state);
    if (!a.length || a.length !== b.length || !timingSafeEqual(a, b))
      throw new UnauthorizedException(
        'La autorización no corresponde a este navegador. Conecta TikTok de nuevo.',
      );
    await this.integration.callback(dto);
    reply.header(
      'Set-Cookie',
      `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=${COOKIE_PATH}; Max-Age=0`,
    );
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');
    return reply.redirect(
      `${this.config.get<string>('CORS_ORIGIN', '').split(',')[0]}/app/tiktok-live`,
      303,
    );
  }
}

@ApiTags('live-sales')
@ApiBearerAuth()
@Controller('live')
export class LiveController {
  constructor(private readonly live: LiveService) {}
  @Get('campaigns') campaigns(@CurrentUser() user: AuthUserPayload) {
    return this.live.campaigns(user.tenantId);
  }
  @Post('campaigns') create(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: LiveCampaignDto,
  ) {
    return this.live.saveCampaign(user, dto);
  }
  @Put('campaigns/:id') update(
    @CurrentUser() user: AuthUserPayload,
    @Param('id') id: string,
    @Body() dto: LiveCampaignDto,
  ) {
    return this.live.saveCampaign(user, dto, id);
  }
  @Post('campaigns/:id/start') start(
    @CurrentUser() user: AuthUserPayload,
    @Param('id') id: string,
  ) {
    return this.live.start(user, id);
  }
  @Get('sessions/:id') panel(
    @CurrentUser() user: AuthUserPayload,
    @Param('id') id: string,
  ) {
    return this.live.panel(user.tenantId, id);
  }
  @Sse('sessions/:id/stream') stream(
    @CurrentUser() user: AuthUserPayload,
    @Param('id') id: string,
  ) {
    return this.live.stream(user.tenantId, id);
  }
  @Patch('sessions/:id/current-product') current(
    @CurrentUser() user: AuthUserPayload,
    @Param('id') id: string,
    @Body() dto: CurrentLiveProductDto,
  ) {
    return this.live.current(user.tenantId, id, dto);
  }
  @Post('sessions/:id/end') end(
    @CurrentUser() user: AuthUserPayload,
    @Param('id') id: string,
  ) {
    return this.live.end(user.tenantId, id);
  }
  @Post('sessions/:id/messages')
  @RateLimit('live-operator-message', 120)
  message(
    @CurrentUser() user: AuthUserPayload,
    @Param('id') id: string,
    @Body() dto: LiveMessageDto,
  ) {
    return this.live.message(user.tenantId, id, dto);
  }
  @Post('sessions/:id/reservations')
  @RateLimit('live-operator-reserve', 60)
  reserve(
    @CurrentUser() user: AuthUserPayload,
    @Param('id') id: string,
    @Body() dto: ReserveLiveDto,
  ) {
    return this.live.reserve(user.tenantId, id, dto);
  }
  @Post('messages/:id/approve') approve(
    @CurrentUser() user: AuthUserPayload,
    @Param('id') id: string,
  ) {
    return this.live.approve(user.tenantId, id);
  }
  @Delete('reservations/:id') cancel(
    @CurrentUser() user: AuthUserPayload,
    @Param('id') id: string,
  ) {
    return this.live.cancel(user.tenantId, id);
  }
}

@ApiTags('tiktok-webhooks')
@Public()
@Controller('webhooks/tiktok')
export class TikTokWebhookController {
  constructor(private readonly integration: TikTokIntegrationService) {}
  @Post()
  @HttpCode(200)
  @RateLimit('tiktok-webhook', 300)
  async handle(
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Headers('tiktok-signature') signature: string | undefined,
  ) {
    if (!req.rawBody)
      throw new UnauthorizedException('Firma de TikTok inválida.');
    await this.integration.webhook(req.rawBody, signature);
    return { received: true };
  }
}
