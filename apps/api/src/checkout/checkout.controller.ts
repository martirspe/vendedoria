import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Public } from '../common/decorators/auth.decorators';
import { StorefrontPublicService } from '../storefront/storefront-public.service';
import { CheckoutService } from './checkout.service';
import {
  CouponPreviewDto,
  CreateCheckoutDto,
  OrderAccessDto,
  PayOrderDto,
} from './dto/checkout.dto';

const PREVIEW_HEADER = 'x-store-preview';

/** Anonymous checkout API. Orders are reachable only with their capability token. */
@ApiTags('storefront-checkout')
@Public()
@Controller('storefront/:slug')
export class CheckoutController {
  constructor(
    private readonly storefront: StorefrontPublicService,
    private readonly checkout: CheckoutService,
  ) {}

  @Post('coupons/preview')
  @HttpCode(200)
  async previewCoupon(
    @Param('slug') slug: string,
    @Body() dto: CouponPreviewDto,
    @Headers(PREVIEW_HEADER) preview: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.checkout.previewCoupon(await this.access(slug, preview, reply), dto);
  }

  @Post('checkout')
  async create(
    @Param('slug') slug: string,
    @Body() dto: CreateCheckoutDto,
    @Headers(PREVIEW_HEADER) preview: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.checkout.create(await this.access(slug, preview, reply), dto);
  }

  @Get('orders/:id')
  async get(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Query() query: OrderAccessDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.checkout.get(await this.access(slug, undefined, reply), id, query.token);
  }

  @Post('orders/:id/pay')
  @HttpCode(200)
  async pay(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: PayOrderDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.checkout.pay(await this.access(slug, undefined, reply), id, dto);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  async cancel(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: OrderAccessDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.checkout.cancel(await this.access(slug, undefined, reply), id, dto.token);
  }

  @Post('orders/:id/simulate')
  @HttpCode(200)
  async simulate(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: OrderAccessDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.checkout.simulatePayment(await this.access(slug, undefined, reply), id, dto.token);
  }

  private async access(slug: string, preview: string | undefined, reply: FastifyReply) {
    reply.header('Cache-Control', 'private, no-store');
    return this.storefront.access(slug, preview);
  }
}
