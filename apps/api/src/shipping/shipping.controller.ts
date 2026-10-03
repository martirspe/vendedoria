import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { UbigeoDistrict } from '@vendedoria/contracts';
import { CurrentUser } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { UBIGEO_DISTRICTS } from '../ubigeo/ubigeo';
import { UpdateShippingDto } from './dto/update-shipping.dto';
import { ShippingService } from './shipping.service';

@ApiTags('shipping')
@ApiBearerAuth()
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Get()
  get(@CurrentUser() user: AuthUserPayload) {
    return this.shipping.get(user.tenantId);
  }

  /** INEI districts for the shipping origin picker. */
  @Get('ubigeos')
  ubigeos(): UbigeoDistrict[] {
    return UBIGEO_DISTRICTS;
  }

  @Patch()
  update(@CurrentUser() user: AuthUserPayload, @Body() dto: UpdateShippingDto) {
    return this.shipping.update(user.tenantId, dto);
  }
}
