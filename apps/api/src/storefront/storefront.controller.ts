import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { UpdateStorefrontDto } from './dto/update-storefront.dto';
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

  @Patch()
  update(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: UpdateStorefrontDto,
  ) {
    return this.storefront.update(user.tenantId, dto);
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
