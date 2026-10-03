import { createHash } from 'node:crypto';
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Public } from '../common/decorators/auth.decorators';
import { verifyMercadoPagoSignature } from '../payments/mercadopago.client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';

type NotificationBody = { type?: string; data?: { id?: string | number } };

/**
 * Plan payments (flow A) on VendedorIA's own Mercado Pago account, signed with the platform
 * webhook secret. Without that secret every notification is rejected.
 */
@ApiExcludeController()
@Public()
@Controller('webhooks/billing')
export class BillingWebhookController {
  private readonly logger = new Logger(BillingWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly billing: BillingService,
  ) {}

  @Post('mercadopago')
  @HttpCode(200)
  async receive(
    @Query() query: Record<string, string | undefined>,
    @Body() body: NotificationBody | undefined,
    @Headers('x-signature') signature: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
  ) {
    const dataId = String(query['data.id'] ?? body?.data?.id ?? '');
    const type = query['type'] ?? body?.type ?? '';
    const secret = this.config.get<string>('PLATFORM_MERCADOPAGO_WEBHOOK_SECRET')?.trim() ?? '';
    if (
      !secret ||
      !verifyMercadoPagoSignature({
        dataId,
        requestId: requestId ?? '',
        header: signature ?? '',
        secret,
      })
    ) {
      throw new UnauthorizedException();
    }

    if (type !== 'payment' || !/^\d{1,20}$/.test(dataId)) {
      return { ok: true, ignored: true };
    }
    const key = createHash('sha256').update(`billing:${type}:${dataId}:${requestId}`).digest('hex');
    if (await this.prisma.webhookEvent.findUnique({ where: { key } })) {
      return { ok: true, duplicate: true };
    }

    await this.billing.applyProviderPayment(dataId);

    try {
      await this.prisma.webhookEvent.create({ data: { key, providerId: dataId } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        this.logger.warn(`Could not record plan webhook ${dataId}: ${(error as Error).message}`);
      }
    }
    return { ok: true };
  }
}
