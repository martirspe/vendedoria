import { createHash } from 'node:crypto';
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Public } from '../common/decorators/auth.decorators';
import { MerchantAccountsService } from '../payments/merchant-accounts.service';
import {
  isProviderOrderId,
  mercadoPago,
  verifyMercadoPagoSignature,
} from '../payments/mercadopago.client';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutService } from './checkout.service';

type NotificationBody = { type?: string; action?: string; data?: { id?: string | number } };

/**
 * One URL per merchant, signed with that merchant's webhook secret. The body is never
 * trusted: the state is always read back from Mercado Pago with the merchant token.
 */
@ApiExcludeController()
@Public()
@Controller('webhooks/mercadopago')
export class MercadoPagoWebhookController {
  private readonly logger = new Logger(MercadoPagoWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: MerchantAccountsService,
    private readonly checkout: CheckoutService,
    private readonly payments: PaymentsService,
  ) {}

  @Post(':tenantId')
  @HttpCode(200)
  async receive(
    @Param('tenantId') tenantId: string,
    @Query() query: Record<string, string | undefined>,
    @Body() body: NotificationBody | undefined,
    @Headers('x-signature') signature: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
  ) {
    if (!/^[a-z0-9]{20,40}$/.test(tenantId)) throw new UnauthorizedException();
    const dataId = String(query['data.id'] ?? body?.data?.id ?? '');
    const type = query['type'] ?? body?.type ?? '';
    const credentials = await this.accounts.credentials(tenantId);
    if (
      !credentials?.webhookSecret ||
      !verifyMercadoPagoSignature({
        dataId,
        requestId: requestId ?? '',
        header: signature ?? '',
        secret: credentials.webhookSecret,
      })
    ) {
      throw new UnauthorizedException();
    }

    const key = createHash('sha256')
      .update(`${tenantId}:${type}:${dataId}:${requestId}`)
      .digest('hex');
    if (await this.prisma.webhookEvent.findUnique({ where: { key } })) {
      return { ok: true, duplicate: true };
    }

    if (type === 'order' && isProviderOrderId(dataId)) {
      await this.checkout.applyProviderOrder(
        tenantId,
        await mercadoPago.getOrder(credentials.accessToken, dataId),
      );
    } else if (type === 'payment' && /^\d{1,20}$/.test(dataId)) {
      await this.payments.applyMercadoPagoPayment(tenantId, dataId, credentials);
    } else {
      return { ok: true, ignored: true };
    }

    try {
      await this.prisma.webhookEvent.create({ data: { key, tenantId, providerId: dataId } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        this.logger.warn(`Could not record webhook ${dataId}: ${(error as Error).message}`);
      }
    }
    return { ok: true };
  }
}
