import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { CurrentUser, Public } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { Turnstile } from '../turnstile/turnstile.decorator';
import { StorefrontPublicService } from '../storefront/storefront-public.service';
import {
  BehaviorEventDto,
  BehaviorForgetDto,
  ConversionSettingsDto,
  RecommendationQueryDto,
  RecoveryAccessDto,
  RecoveryActivityDto,
  RecoveryCaptureDto,
} from './dto/conversion.dto';
import { RecoveryService } from './recovery.service';
import { RecommendationsService } from './recommendations.service';

@ApiTags('storefront-conversion')
@Public()
@Controller('storefront/:slug')
export class ConversionPublicController {
  constructor(
    private readonly storefront: StorefrontPublicService,
    private readonly recovery: RecoveryService,
    private readonly recommendations: RecommendationsService,
  ) {}
  private async access(
    slug: string,
    preview: string | undefined,
    reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'private, no-store');
    return this.storefront.access(slug, preview);
  }
  @Get('recovery/options')
  options(
    @Param('slug') slug: string,
    @Headers('x-store-preview') preview: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.access(slug, preview, reply).then((access) =>
      this.recovery.availability(access),
    );
  }
  @Post('recovery')
  @RateLimit('store-recovery-capture', 5)
  @Turnstile('recovery')
  async capture(
    @Param('slug') slug: string,
    @Headers('x-store-preview') preview: string | undefined,
    @Body() dto: RecoveryCaptureDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.recovery.capture(await this.access(slug, preview, reply), dto);
  }
  @Post('recovery/restore')
  @RateLimit('store-recovery-access', 20)
  @HttpCode(200)
  async restore(
    @Param('slug') slug: string,
    @Body() dto: RecoveryAccessDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.recovery.restore(
      await this.access(slug, undefined, reply),
      dto.token,
    );
  }
  @Post('recovery/activity')
  @RateLimit('store-recovery-access', 20)
  @HttpCode(200)
  async activity(
    @Param('slug') slug: string,
    @Body() dto: RecoveryActivityDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.recovery.activity(
      await this.access(slug, undefined, reply),
      dto.token,
      dto.items,
    );
  }
  @Post('recovery/revoke')
  @RateLimit('store-recovery-access', 20)
  @HttpCode(200)
  async revoke(
    @Param('slug') slug: string,
    @Body() dto: RecoveryAccessDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.recovery.revoke(
      await this.access(slug, undefined, reply),
      dto.token,
    );
  }
  @Get('recommendations')
  @RateLimit('store-recommendations', 60)
  async recommend(
    @Param('slug') slug: string,
    @Headers('x-store-preview') preview: string | undefined,
    @Query() query: RecommendationQueryDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const start = performance.now();
    const result = await this.recommendations.recommend(
      await this.access(slug, preview, reply),
      query,
    );
    reply.header(
      'Server-Timing',
      `recommendations;dur=${(performance.now() - start).toFixed(1)}`,
    );
    return result;
  }
  @Post('behavior')
  @RateLimit('store-behavior', 30)
  @HttpCode(200)
  async behavior(
    @Param('slug') slug: string,
    @Headers('x-store-preview') preview: string | undefined,
    @Body() dto: BehaviorEventDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.recommendations.record(
      await this.access(slug, preview, reply),
      dto,
    );
  }
  @Post('behavior/forget')
  @RateLimit('store-behavior', 30)
  @HttpCode(200)
  async forget(
    @Param('slug') slug: string,
    @Body() dto: BehaviorForgetDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const access = await this.access(slug, undefined, reply);
    return this.recommendations.forget(access.tenantId, dto.sessionId);
  }
}

@ApiTags('conversion')
@ApiBearerAuth()
@Controller('conversion')
export class ConversionController {
  constructor(private readonly recovery: RecoveryService) {}
  @Get('summary') summary(@CurrentUser() user: AuthUserPayload) {
    return this.recovery.summary(user.tenantId);
  }
  @Get('settings') settings(@CurrentUser() user: AuthUserPayload) {
    return this.recovery.settings(user.tenantId);
  }
  @Put('settings') save(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: ConversionSettingsDto,
  ) {
    if (!['OWNER', 'ADMIN'].includes(user.membershipRole))
      throw new ForbiddenException(
        'Solo un administrador puede configurar los recordatorios.',
      );
    return this.recovery.saveSettings(user.tenantId, dto);
  }
}
