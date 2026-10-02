import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { CurrentUser } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import {
  CreateOrderDto,
  CreatePaymentLinkDto,
  ReconcileOrderDto,
  UpdateOrderStatusDto,
} from './dto/orders.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUserPayload,
    @Query('status') status?: OrderStatus,
    @Query('tab') tab?: 'new' | 'all',
    @Query('q') q?: string,
  ) {
    return this.ordersService.list(user.tenantId, { status, tab, q });
  }

  @Get(':orderId')
  get(
    @CurrentUser() user: AuthUserPayload,
    @Param('orderId') orderId: string,
  ) {
    return this.ordersService.getById(user.tenantId, orderId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.create(user.tenantId, dto);
  }

  @Post(':orderId/payment-link')
  createPaymentLink(
    @CurrentUser() user: AuthUserPayload,
    @Param('orderId') orderId: string,
    @Body() dto: CreatePaymentLinkDto,
  ) {
    return this.ordersService.createPaymentLink(user.tenantId, orderId, dto);
  }

  @Post(':orderId/reconcile')
  reconcile(
    @CurrentUser() user: AuthUserPayload,
    @Param('orderId') orderId: string,
    @Body() dto: ReconcileOrderDto,
  ) {
    return this.ordersService.reconcile(user.tenantId, orderId, dto);
  }

  @Get(':orderId/email-preview')
  emailPreview(
    @CurrentUser() user: AuthUserPayload,
    @Param('orderId') orderId: string,
  ) {
    return this.ordersService.emailPreview(user.tenantId, orderId);
  }

  @Patch(':orderId/status')
  updateStatus(
    @CurrentUser() user: AuthUserPayload,
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(user.tenantId, orderId, dto);
  }
}
