import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { CustomDomainService } from './custom-domain.service';
import { SetCustomDomainDto, UpdateTrackingDto } from './dto/integrations.dto';
import { IntegrationsService } from './integrations.service';

@ApiTags('integrations')
@ApiBearerAuth()
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly customDomain: CustomDomainService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUserPayload) {
    return this.integrations.list(user.tenantId);
  }

  @Get('custom-domain')
  getCustomDomain(@CurrentUser() user: AuthUserPayload) {
    return this.customDomain.get(user.tenantId);
  }

  @Put('custom-domain')
  setCustomDomain(@CurrentUser() user: AuthUserPayload, @Body() dto: SetCustomDomainDto) {
    return this.customDomain.set(user, dto.domain);
  }

  @Post('custom-domain/verify')
  @HttpCode(200)
  verifyCustomDomain(@CurrentUser() user: AuthUserPayload) {
    return this.customDomain.verify(user);
  }

  @Delete('custom-domain')
  removeCustomDomain(@CurrentUser() user: AuthUserPayload) {
    return this.customDomain.remove(user);
  }

  @Get('tracking')
  getTracking(@CurrentUser() user: AuthUserPayload) {
    return this.integrations.getTracking(user.tenantId);
  }

  @Put('tracking')
  updateTracking(@CurrentUser() user: AuthUserPayload, @Body() dto: UpdateTrackingDto) {
    return this.integrations.updateTracking(user, dto);
  }

  @Post(':key/enable')
  @HttpCode(200)
  enable(@CurrentUser() user: AuthUserPayload, @Param('key') key: string) {
    return this.integrations.enable(user, key);
  }

  @Post(':key/disable')
  @HttpCode(200)
  disable(@CurrentUser() user: AuthUserPayload, @Param('key') key: string) {
    return this.integrations.disable(user, key);
  }
}
