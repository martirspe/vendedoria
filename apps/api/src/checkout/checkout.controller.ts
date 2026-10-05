import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import type { ShippingQuote, UbigeoDistrict } from '@vendedoria/contracts';
import { Public } from '../common/decorators/auth.decorators';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { StorefrontPublicService } from '../storefront/storefront-public.service';
import { Turnstile } from '../turnstile/turnstile.decorator';
import { UBIGEO_DISTRICTS } from '../ubigeo/ubigeo';
import { CheckoutService } from './checkout.service';
import { LiveTokenDto } from '../live/dto/live.dto';
import {
  CouponPreviewDto,
  CreateCheckoutDto,
  OrderAccessDto,
  PayOrderDto,
  ShippingQuoteQueryDto,
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

  /** INEI district list for the delivery selects; identical for every store. */
  @Get('ubigeos')
  async ubigeos(
    @Param('slug') slug: string,
    @Headers(PREVIEW_HEADER) preview: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<UbigeoDistrict[]> {
    await this.storefront.access(slug, preview);
    reply.header('Cache-Control', 'public, max-age=86400');
    return UBIGEO_DISTRICTS;
  }

  /** Reference courier rates (Olva/Shalom) to the district, by distance from the store. */
  @Get('shipping-quote')
  async shippingQuote(
    @Param('slug') slug: string,
    @Query() query: ShippingQuoteQueryDto,
    @Headers(PREVIEW_HEADER) preview: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ShippingQuote[]> {
    return this.checkout.quoteCarriers(await this.access(slug, preview, reply), query.ubigeo);
  }

  @Post('coupons/preview')
  @RateLimit('store-coupon', 10)
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
  @RateLimit('store-checkout', 10)
  @Turnstile('checkout')
  async create(
    @Param('slug') slug: string,
    @Body() dto: CreateCheckoutDto,
    @Headers(PREVIEW_HEADER) preview: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.checkout.create(await this.access(slug, preview, reply), dto);
  }

  @Post('live-reservation')
  @HttpCode(200)
  @RateLimit('live-checkout-access', 30)
  async liveReservation(@Param('slug') slug: string, @Body() dto: LiveTokenDto, @Headers(PREVIEW_HEADER) preview: string | undefined, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.checkout.liveReservation(await this.access(slug, preview, reply), dto.token);
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
  @RateLimit('store-pay', 10)
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
  @RateLimit('store-order-action', 20)
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
  @RateLimit('store-order-action', 20)
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
