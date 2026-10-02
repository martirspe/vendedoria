import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { CouponsService } from './coupons.service';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';

@ApiTags('coupons')
@ApiBearerAuth()
@Controller('coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  list(@CurrentUser() user: AuthUserPayload) {
    return this.coupons.list(user.tenantId);
  }

  @Get('targets')
  targets(@CurrentUser() user: AuthUserPayload) {
    return this.coupons.targets(user.tenantId);
  }

  @Post()
  create(@CurrentUser() user: AuthUserPayload, @Body() dto: CreateCouponDto) {
    return this.coupons.create(user.tenantId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateCouponDto,
  ) {
    return this.coupons.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUserPayload, @Param('id') id: string) {
    return this.coupons.remove(user.tenantId, id);
  }
}
