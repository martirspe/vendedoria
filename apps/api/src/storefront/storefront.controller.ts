import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { UbigeoDistrict } from '@vendedoria/contracts';
import { CurrentUser } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { UBIGEO_DISTRICTS } from '../ubigeo/ubigeo';
import { UpdateStorefrontDto } from './dto/update-storefront.dto';
import { UpdateSubdomainDto } from './dto/update-subdomain.dto';
import { StorefrontService } from './storefront.service';

@ApiTags('storefront-admin')
@ApiBearerAuth()
@Controller('store')
export class StorefrontController {
  constructor(private readonly storefront: StorefrontService) {}

  @Get()
  get(@CurrentUser() user: AuthUserPayload) {
    return this.storefront.get(user.tenantId);
  }

  /** INEI districts for the shipping origin picker. */
  @Get('ubigeos')
  ubigeos(): UbigeoDistrict[] {
    return UBIGEO_DISTRICTS;
  }

  @Patch()
  update(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: UpdateStorefrontDto,
  ) {
    return this.storefront.update(user.tenantId, dto);
  }

  @Patch('subdomain')
  changeSubdomain(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: UpdateSubdomainDto,
  ) {
    return this.storefront.changeSubdomain(user.tenantId, dto.slug);
  }

  @Post('publish')
  publish(@CurrentUser() user: AuthUserPayload) {
    return this.storefront.publish(user.tenantId);
  }

  @Post('unpublish')
  unpublish(@CurrentUser() user: AuthUserPayload) {
    return this.storefront.unpublish(user.tenantId);
  }

  @Post('products/show-available')
  showAvailableProducts(@CurrentUser() user: AuthUserPayload) {
    return this.storefront.showAvailableProducts(user.tenantId);
  }

  @Post('preview-link')
  previewLink(@CurrentUser() user: AuthUserPayload) {
    return this.storefront.previewLink(user.tenantId);
  }
}
