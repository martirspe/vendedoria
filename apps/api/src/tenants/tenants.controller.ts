import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantsService } from './tenants.service';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthUserPayload) {
    return this.tenantsService.getCurrent(user.tenantId);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.updateCurrent(user.tenantId, dto);
  }
}
