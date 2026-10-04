import { createHash, randomBytes, randomInt } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Order, OrderItem, Prisma } from '@prisma/client';
import type {
  CouponPreviewResult,
  PublicOrder,
  PublicOrderStatus,
  ShippingMode,
  ShippingQuote,
  UbigeoDistrict,
} from '@vendedoria/contracts';
import { couponCustomerKey, CouponsService } from '../coupons/coupons.service';
import type { CouponLine } from '../coupons/coupon-engine';
import { releaseOrder, settlePaidOrder } from '../orders/settlement';
import { reserveStock, withAllocations } from '../orders/stock';
import { MerchantAccountsService } from '../payments/merchant-accounts.service';
import {
  type MercadoPagoOrder,
  MercadoPagoError,
  isProviderOrderId,
  mercadoPago,
} from '../payments/mercadopago.client';
import { PrismaService } from '../prisma/prisma.service';
import { carrierQuotes, quoteShipping } from '../storefront/shipping';
import type { StoreAccess } from '../storefront/storefront-public.service';
import { findUbigeo } from '../ubigeo/ubigeo';
import { StorefrontPublicService } from '../storefront/storefront-public.service';
import {
  CheckoutItemDto,
  CouponPreviewDto,
  CreateCheckoutDto,
  PayOrderDto,
} from './dto/checkout.dto';
import { OrderEmailService } from './order-email.service';
import { fulfillmentSnapshot, orderFulfillment } from '../orders/digital-access';

const RESERVATION_MS = 15 * 60_000;
const EXPIRY_SWEEP_MS = 60_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type FullOrder = Order & { items: OrderItem[] };

type DeliveryRecord = {
  mode: ShippingMode;
  label: string;
  address: string | null;
  ubigeo: string | null;
  district: string | null;
  province: string | null;
  department: string | null;
  reference: string | null;
  eta: string | null;
  free: boolean;
};

type ResolvedLine = {
  productId: string;
  variantId: string | null;
  title: string;
  handle: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
  isService: boolean;
  /** Only physical products ship; services and digital products never do. */
  ships: boolean;
  fulfillment: Prisma.InputJsonObject;
  coupon: CouponLine;
};

const SERVICES_FREE_SHIPPING =
  'El envío gratis de este cupón aplica solo a productos con envío.';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const amount = (cents: number) => (cents / 100).toFixed(2);

/** A free shipping coupon must not be spent where shipping is already free. */
function assertFreeShippingCoupon(
  freeShippingFromCents: number | null,
  mode: ShippingMode | undefined,
  subtotalCents: number,
): void {
  if (mode === 'PICKUP') {
    throw new BadRequestException(
      'El envío gratis de este cupón aplica solo a entregas a domicilio.',
    );
  }
  if (
    freeShippingFromCents !== null &&
    freeShippingFromCents > 0 &&
    subtotalCents >= freeShippingFromCents
  ) {
    throw new BadRequestException(
      'Tu pedido ya tiene envío gratis. Guarda este cupón para otra compra.',
    );
  }
}

@Injectable()
export class CheckoutService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CheckoutService.name);
  private sweep?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly coupons: CouponsService,
    private readonly accounts: MerchantAccountsService,
    private readonly storefront: StorefrontPublicService,
    private readonly email: OrderEmailService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.sweep = setInterval(() => {
      this.expireDue().catch((error: unknown) =>
        this.logger.error(`Expiry sweep failed: ${(error as Error).message}`),
      );
    }, EXPIRY_SWEEP_MS);
    this.sweep.unref();
  }

  onModuleDestroy(): void {
    if (this.sweep) clearInterval(this.sweep);
  }

  async previewCoupon(
    access: StoreAccess,
    dto: CouponPreviewDto,
  ): Promise<CouponPreviewResult> {
    const lines = await this.resolveLines(
      this.prisma,
      access.tenantId,
      dto.items,
    );
    const quote = await this.coupons.quote(this.prisma, access.tenantId, {
      code: dto.code,
      lines: lines.map((line) => line.coupon),
      email: dto.email,
    });
    if (quote.freeShipping) {
      if (!lines.some((line) => line.ships))
        throw new BadRequestException(SERVICES_FREE_SHIPPING);
      const storefront = await this.prisma.storefront.findUniqueOrThrow({
        where: { tenantId: access.tenantId },
      });
      assertFreeShippingCoupon(
        storefront.freeShippingFromCents,
        dto.mode,
        lines.reduce((sum, line) => sum + line.totalCents, 0),
      );
    }
    return {
      code: quote.coupon.code,
      label: quote.coupon.label,
      discountCents: quote.discountCents,
      freeShipping: quote.freeShipping,
    };
  }

  async quoteCarriers(
    access: StoreAccess,
    ubigeo: string,
  ): Promise<ShippingQuote[]> {
    if (!findUbigeo(ubigeo))
      throw new BadRequestException('Selecciona un distrito válido.');
    const storefront = await this.prisma.storefront.findUniqueOrThrow({
      where: { tenantId: access.tenantId },
    });
    return carrierQuotes(storefront, ubigeo);
  }

  async create(
    access: StoreAccess,
    dto: CreateCheckoutDto,
  ): Promise<PublicOrder> {
    this.assertLive(access);
    const checkout = await this.storefront.checkout(access.tenantId);
    if (checkout.mode !== 'online') {
      throw new ConflictException('Esta tienda recibe pedidos por WhatsApp.');
    }
    const email = dto.customer.email.trim().toLowerCase();
    const requestHash = sha256(
      JSON.stringify({
        items: dto.items.map((i) => [
          i.handle,
          i.variantId ?? null,
          i.quantity,
        ]),
        customer: { ...dto.customer, email },
        delivery: dto.delivery ?? null,
        serviceNote: dto.serviceNote?.trim() || null,
        coupon: dto.couponCode?.trim().toUpperCase() || null,
      }),
    );
    const replay = await this.findReplay(
      access.tenantId,
      dto.checkoutKey,
      requestHash,
    );
    if (replay) return this.view(replay);
    const place = dto.delivery
      ? this.deliveryPlace(
          dto.delivery.mode,
          dto.delivery.ubigeo,
          dto.delivery.acknowledgeRate,
        )
      : null;

    const storefront = await this.prisma.storefront.findUniqueOrThrow({
      where: { tenantId: access.tenantId },
    });

    for (let attempt = 0; ; attempt++) {
      try {
        const order = await this.prisma.$transaction(
          async (tx) => {
            const lines = await this.resolveLines(
              tx,
              access.tenantId,
              dto.items,
            );
            const subtotalCents = lines.reduce(
              (sum, line) => sum + line.totalCents,
              0,
            );
            const coupon = dto.couponCode?.trim()
              ? await this.coupons.quote(
                  tx,
                  access.tenantId,
                  {
                    code: dto.couponCode,
                    lines: lines.map((l) => l.coupon),
                    email,
                  },
                  { lock: true },
                )
              : null;
            const shipsGoods = lines.some((line) => line.ships);
            const hasServices = lines.some((line) => line.isService);
            if (coupon?.freeShipping) {
              if (!shipsGoods)
                throw new BadRequestException(SERVICES_FREE_SHIPPING);
              assertFreeShippingCoupon(
                storefront.freeShippingFromCents,
                dto.delivery?.mode,
                subtotalCents,
              );
            }
            const discountCents = coupon?.discountCents ?? 0;
            let delivery: DeliveryRecord | null = null;
            let shippingCents = 0;
            if (shipsGoods) {
              if (!dto.delivery)
                throw new BadRequestException('Elige una forma de entrega.');
              const shipping = quoteShipping(
                storefront,
                dto.delivery.mode,
                subtotalCents - discountCents,
                coupon?.freeShipping ?? false,
                place?.code,
              );
              if (!shipping) {
                throw new BadRequestException(
                  'Elige una forma de entrega disponible.',
                );
              }
              const pickup = shipping.mode === 'PICKUP';
              shippingCents = shipping.cents;
              delivery = {
                mode: shipping.mode,
                label: shipping.label,
                address: pickup ? null : (dto.delivery.address?.trim() ?? null),
                ubigeo: place?.code ?? null,
                district: place?.district ?? null,
                province: place?.province ?? null,
                department: place?.department ?? null,
                reference: dto.delivery.reference?.trim() || null,
                eta: pickup
                  ? storefront.pickupAddress
                  : 'Tarifa referencial: la cobertura se coordina antes del despacho.',
                free: shipping.free,
              };
            }
            const stocked = await withAllocations(tx, lines);
            await reserveStock(tx, stocked);
            return tx.order.create({
              data: {
                tenantId: access.tenantId,
                channel: 'WEB',
                status: 'PENDING_PAYMENT',
                code: this.newCode(),
                currency: 'PEN',
                subtotalCents,
                discountCents,
                shippingCents,
                totalCents: subtotalCents - discountCents + shippingCents,
                couponCode: coupon?.coupon.code ?? null,
                customerName: dto.customer.name.trim(),
                customerEmail: email,
                customerPhone: dto.customer.phone,
                customerDocument: dto.customer.document ?? null,
                delivery: delivery ?? Prisma.DbNull,
                serviceNote: hasServices
                  ? dto.serviceNote?.trim() || null
                  : null,
                checkoutKey: dto.checkoutKey,
                requestHash,
                publicToken: randomBytes(24).toString('base64url'),
                stockState: 'held',
                expiresAt: new Date(Date.now() + RESERVATION_MS),
                items: {
                  create: stocked.map((line) => ({
                    productId: line.productId,
                    fulfillment: line.fulfillment,
                    variantId: line.variantId,
                    title: line.title,
                    handle: line.handle,
                    quantity: line.quantity,
                    unitCents: line.unitCents,
                    totalCents: line.totalCents,
                    ...(line.allocations
                      ? { allocations: line.allocations }
                      : {}),
                  })),
                },
                ...(coupon
                  ? {
                      redemption: {
                        create: {
                          couponId: coupon.coupon.id,
                          customerKey:
                            coupon.customerKey ?? couponCustomerKey(email),
                          discountCents,
                        },
                      },
                    }
                  : {}),
              },
              include: { items: true },
            });
          },
          { timeout: 15_000 },
        );
        return this.view(order);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const target = String(error.meta?.target ?? '');
          if (target.includes('checkoutKey')) {
            const raced = await this.findReplay(
              access.tenantId,
              dto.checkoutKey,
              requestHash,
            );
            if (raced) return this.view(raced);
          }
          if (target.includes('code') && attempt < 3) continue;
        }
        throw error;
      }
    }
  }

  async get(
    access: StoreAccess,
    orderId: string,
    token: string,
  ): Promise<PublicOrder> {
    let order = await this.owned(access.tenantId, orderId, token);
    if (
      order.status === 'PENDING_PAYMENT' &&
      this.isExpired(order) &&
      !order.paymentKey
    ) {
      await this.expire(order.id);
      order = await this.owned(access.tenantId, orderId, token);
    } else if (
      order.paymentState === 'processing' ||
      order.paymentState === 'review'
    ) {
      order = (await this.refreshFromProvider(order)) ?? order;
    }
    return this.view(order);
  }

  async cancel(
    access: StoreAccess,
    orderId: string,
    token: string,
  ): Promise<PublicOrder> {
    const order = await this.owned(access.tenantId, orderId, token);
    await this.prisma.$transaction(async (tx) => {
      await this.lockOrder(tx, order.id);
      const fresh = await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true },
      });
      if (fresh.status !== 'PENDING_PAYMENT') {
        throw new ConflictException('Este pedido ya no se puede cancelar.');
      }
      if (fresh.paymentKey) {
        throw new ConflictException(
          'El pago ya fue enviado. Espera su resultado.',
        );
      }
      await releaseOrder(tx, fresh, 'Cancelado por el comprador');
    });
    return this.view(await this.owned(access.tenantId, orderId, token));
  }

  async pay(
    access: StoreAccess,
    orderId: string,
    dto: PayOrderDto,
  ): Promise<PublicOrder> {
    this.assertLive(access);
    const credentials = await this.accounts.credentials(access.tenantId);
    if (!credentials?.webhookSecret) {
      throw new ConflictException('Esta tienda no tiene pagos online activos.');
    }
    const { token, ...payment } = dto;
    const fingerprint = sha256(JSON.stringify(payment));
    const claim = await this.prisma.$transaction(async (tx) => {
      await this.lockOrder(tx, orderId);
      const order = await tx.order.findFirst({
        where: {
          id: orderId,
          tenantId: access.tenantId,
          publicToken: token,
          channel: 'WEB',
        },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('Pedido no encontrado.');
      if (order.paymentKey) {
        if (
          order.paymentKey !== dto.paymentKey ||
          order.paymentHash !== fingerprint
        ) {
          throw new ConflictException(
            'Ya hay un pago en curso. Espera su resultado.',
          );
        }
        return { order, send: false };
      }
      if (order.status !== 'PENDING_PAYMENT') {
        throw new ConflictException('Este pedido ya no admite pagos.');
      }
      if (this.isExpired(order)) {
        throw new ConflictException(
          'La reserva venció. Vuelve a armar tu carrito.',
        );
      }
      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          paymentKey: dto.paymentKey,
          paymentHash: fingerprint,
          paymentMethod: dto.method,
          paymentState: 'processing',
          paymentDetail: null,
        },
        include: { items: true },
      });
      await tx.payment.create({
        data: {
          tenantId: access.tenantId,
          orderId: order.id,
          flow: 'COMMERCE_CHECKOUT',
          provider: 'mercadopago',
          status: 'PENDING',
          amountCents: order.totalCents,
          currency: order.currency,
          idempotencyKey: `web:${dto.paymentKey}`,
        },
      });
      return { order: updated, send: true };
    });

    if (!claim.send) {
      const refreshed = await this.refreshFromProvider(claim.order);
      return this.view(refreshed ?? claim.order);
    }

    const order = claim.order;
    const total = amount(order.totalCents);
    const yape = dto.method === 'yape';
    const body = {
      type: 'online',
      processing_mode: 'automatic',
      external_reference: order.id,
      total_amount: total,
      description: `Pedido ${order.code}`,
      payer: {
        email: order.customerEmail,
        ...(dto.identificationType && dto.identificationNumber
          ? {
              identification: {
                type: dto.identificationType,
                number: dto.identificationNumber,
              },
            }
          : {}),
        ...(yape
          ? {
              entity_type: 'individual',
              phone: { area_code: '51', number: dto.phone },
            }
          : {}),
      },
      transactions: {
        payments: [
          {
            amount: total,
            payment_method: {
              id: yape ? 'yape' : dto.paymentMethodId,
              type: yape ? 'debit_card' : dto.paymentType,
              token: dto.cardToken,
              installments: 1,
            },
          },
        ],
      },
    };
    try {
      const providerOrder = await mercadoPago.createOrder(
        credentials.accessToken,
        body,
        dto.paymentKey,
      );
      await this.prisma.payment.updateMany({
        where: { idempotencyKey: `web:${dto.paymentKey}` },
        data: { externalId: providerOrder.id },
      });
      await this.applyProviderOrder(access.tenantId, providerOrder);
    } catch (error) {
      if (
        error instanceof MercadoPagoError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        await this.rejectAttempt(
          order.id,
          dto.paymentKey,
          'Mercado Pago rechazó el pago. Revisa los datos o usa otro medio.',
        );
      } else if (!(error instanceof ConflictException)) {
        this.logger.warn(
          `Payment for order ${order.id} needs review: ${(error as Error).message}`,
        );
        await this.prisma.order.updateMany({
          where: { id: order.id, paymentState: 'processing' },
          data: { paymentState: 'review' },
        });
      }
    }
    return this.view(await this.owned(access.tenantId, orderId, token));
  }

  /** Development only: pays a web order without credentials. */
  async simulatePayment(
    access: StoreAccess,
    orderId: string,
    token: string,
  ): Promise<PublicOrder> {
    const checkout = await this.storefront.checkout(access.tenantId);
    if (!checkout.simulator) {
      throw new ForbiddenException(
        'El pago simulado solo existe en desarrollo.',
      );
    }
    const order = await this.owned(access.tenantId, orderId, token);
    if (order.status !== 'PENDING_PAYMENT' || this.isExpired(order)) {
      throw new ConflictException('Este pedido ya no admite pagos.');
    }
    const settled = await this.prisma.$transaction(async (tx) => {
      await this.lockOrder(tx, order.id);
      const fresh = await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true },
      });
      await tx.order.update({
        where: { id: fresh.id },
        data: { paymentMethod: 'simulator' },
      });
      return settlePaidOrder(tx, fresh, 'simulator');
    });
    if (settled) await this.email.sendConfirmation(order.id);
    return this.view(await this.owned(access.tenantId, orderId, token));
  }

  /**
   * Applies the real state of an Orders API order. Called after creating it, when the
   * buyer polls and from the signed webhook. Idempotent.
   */
  async applyProviderOrder(
    tenantId: string,
    providerOrder: MercadoPagoOrder,
  ): Promise<void> {
    if (!isProviderOrderId(providerOrder.id)) return;
    let paidNow = false;
    await this.prisma.$transaction(async (tx) => {
      await this.lockOrder(tx, providerOrder.external_reference);
      const order = await tx.order.findFirst({
        where: {
          id: providerOrder.external_reference,
          tenantId,
          channel: 'WEB',
        },
        include: { items: true },
      });
      if (!order) return;
      const attempt = await tx.payment.findFirst({
        where: { orderId: order.id, externalId: providerOrder.id },
      });
      if (!attempt) return;

      const amountMatches =
        Number(providerOrder.total_amount) === order.totalCents / 100 &&
        (!providerOrder.currency || providerOrder.currency === 'PEN');
      const paid =
        providerOrder.status === 'processed' &&
        providerOrder.status_detail === 'accredited' &&
        Number(
          providerOrder.total_paid_amount ?? providerOrder.total_amount,
        ) ===
          order.totalCents / 100;
      const failed = ['failed', 'canceled', 'cancelled', 'expired'].includes(
        providerOrder.status,
      );
      const reversed = ['refunded', 'charged_back', 'chargeback'].includes(
        providerOrder.status,
      );
      const detail =
        providerOrder.status_detail?.slice(0, 100) ?? providerOrder.status;

      if (!amountMatches) {
        this.logger.error(
          `Amount mismatch for order ${order.id} / ${providerOrder.id}`,
        );
        await tx.order.update({
          where: { id: order.id },
          data: { paymentState: 'review' },
        });
        return;
      }

      if (paid) {
        await tx.payment.update({
          where: { id: attempt.id },
          data: { status: 'SUCCEEDED' },
        });
        if (order.status === 'CANCELLED') {
          await tx.order.update({
            where: { id: order.id },
            data: { paymentState: 'paid_late', paymentDetail: detail },
          });
          await tx.paymentEvent.create({
            data: {
              orderId: order.id,
              status: 'paid_late',
              detail: `Pago tras cancelar: ${providerOrder.id}`,
            },
          });
          return;
        }
        paidNow = await settlePaidOrder(
          tx,
          order,
          `mercadopago:${providerOrder.id}`,
        );
        return;
      }

      if (reversed) {
        await tx.order.update({
          where: { id: order.id },
          data: { paymentState: 'refunded', paymentDetail: detail },
        });
        await tx.paymentEvent.create({
          data: { orderId: order.id, status: 'refunded', detail },
        });
        return;
      }

      if (failed) {
        await tx.payment.update({
          where: { id: attempt.id },
          data: { status: 'FAILED' },
        });
        if (
          order.status === 'PENDING_PAYMENT' &&
          order.paymentKey === attempt.idempotencyKey.replace(/^web:/, '')
        ) {
          await tx.order.update({
            where: { id: order.id },
            data: {
              paymentKey: null,
              paymentHash: null,
              paymentState: 'rejected',
              paymentDetail: detail,
            },
          });
          await tx.paymentEvent.create({
            data: { orderId: order.id, status: 'rejected', detail },
          });
        }
        return;
      }

      if (order.status === 'PENDING_PAYMENT') {
        await tx.order.update({
          where: { id: order.id },
          data: { paymentState: 'processing', paymentDetail: detail },
        });
      }
    });
    if (paidNow)
      await this.email.sendConfirmation(providerOrder.external_reference);
  }

  /**
   * Console reconciliation: re-reads a Mercado Pago order (the `ORD…` reference shown in
   * the merchant's MP account, or the last attempt) and applies it like the webhook.
   */
  async reconcile(tenantId: string, orderId: string, providerOrderId?: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId, channel: 'WEB' },
      select: { id: true, totalCents: true, currency: true },
    });
    if (!order)
      throw new NotFoundException(
        'Solo se concilian pedidos de la tienda web.',
      );
    const reference =
      providerOrderId?.trim() ||
      (
        await this.prisma.payment.findFirst({
          where: { orderId: order.id, externalId: { not: null } },
          orderBy: { createdAt: 'desc' },
          select: { externalId: true },
        })
      )?.externalId;
    if (!reference)
      throw new BadRequestException(
        'Este pedido no tiene intentos de pago. Ingresa la referencia ORD.',
      );
    if (!isProviderOrderId(reference))
      throw new BadRequestException('La referencia debe empezar con ORD.');
    const credentials = await this.accounts.credentials(tenantId);
    if (!credentials)
      throw new ConflictException(
        'Conecta tu cuenta de Mercado Pago para conciliar.',
      );
    let providerOrder: MercadoPagoOrder;
    try {
      providerOrder = await mercadoPago.getOrder(
        credentials.accessToken,
        reference,
      );
    } catch {
      throw new BadRequestException(
        'Mercado Pago no encontró esa referencia en tu cuenta.',
      );
    }
    if (providerOrder.external_reference !== order.id) {
      throw new BadRequestException(
        'Esa referencia de Mercado Pago pertenece a otro pedido.',
      );
    }
    const known = await this.prisma.payment.findFirst({
      where: { orderId: order.id, externalId: reference },
    });
    if (!known) {
      await this.prisma.payment.create({
        data: {
          tenantId,
          orderId: order.id,
          flow: 'COMMERCE_CHECKOUT',
          status: 'PENDING',
          amountCents: order.totalCents,
          currency: order.currency,
          externalId: reference,
          idempotencyKey: `reconcile:${reference}`,
        },
      });
    }
    await this.applyProviderOrder(tenantId, providerOrder);
    return {
      reference,
      providerStatus: providerOrder.status,
      detail: providerOrder.status_detail ?? null,
    };
  }

  /** Releases reservations whose time ran out and no payment is in flight. */
  async expireDue(): Promise<number> {
    const due = await this.prisma.order.findMany({
      where: {
        status: 'PENDING_PAYMENT',
        stockState: 'held',
        expiresAt: { lt: new Date() },
        paymentKey: null,
      },
      select: { id: true },
      take: 50,
    });
    for (const { id } of due) await this.expire(id);
    return due.length;
  }

  private async expire(orderId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockOrder(tx, orderId);
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (
        !order ||
        order.status !== 'PENDING_PAYMENT' ||
        order.paymentKey ||
        !this.isExpired(order)
      ) {
        return;
      }
      await releaseOrder(tx, order, 'Reserva vencida', 'expired');
    });
  }

  private async rejectAttempt(
    orderId: string,
    paymentKey: string,
    detail: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { idempotencyKey: `web:${paymentKey}` },
        data: { status: 'FAILED' },
      });
      await tx.order.updateMany({
        where: { id: orderId, paymentKey },
        data: {
          paymentKey: null,
          paymentHash: null,
          paymentState: 'rejected',
          paymentDetail: detail,
        },
      });
      await tx.paymentEvent.create({
        data: { orderId, status: 'rejected', detail },
      });
    });
  }

  private async refreshFromProvider(
    order: FullOrder,
  ): Promise<FullOrder | null> {
    const attempt = await this.prisma.payment.findFirst({
      where: {
        orderId: order.id,
        externalId: { not: null },
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!attempt?.externalId) return null;
    const credentials = await this.accounts.credentials(order.tenantId);
    if (!credentials) return null;
    try {
      await this.applyProviderOrder(
        order.tenantId,
        await mercadoPago.getOrder(credentials.accessToken, attempt.externalId),
      );
    } catch (error) {
      this.logger.warn(
        `Could not refresh order ${order.id}: ${(error as Error).message}`,
      );
      return null;
    }
    return this.prisma.order.findUnique({
      where: { id: order.id },
      include: { items: true },
    });
  }

  private async resolveLines(
    db: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    items: CheckoutItemDto[],
  ): Promise<ResolvedLine[]> {
    const merged = new Map<string, CheckoutItemDto>();
    for (const item of items) {
      const key = `${item.handle}::${item.variantId ?? ''}`;
      const current = merged.get(key);
      merged.set(key, {
        ...item,
        quantity: (current?.quantity ?? 0) + item.quantity,
      });
    }
    const handles = [...new Set(items.map((item) => item.handle))];
    const products = await db.product.findMany({
      where: { tenantId, handle: { in: handles }, isPublishedOnStore: true },
      include: { variants: true, _count: { select: { components: true } } },
    });
    const lines: ResolvedLine[] = [];
    for (const item of merged.values()) {
      const product = products.find((p) => p.handle === item.handle);
      if (!product || !product.isAvailable) {
        throw new ConflictException(
          'Un producto de tu carrito ya no está disponible. Actualiza tu carrito.',
        );
      }
      if (product.currency !== 'PEN') {
        throw new BadRequestException('Solo se aceptan productos en soles.');
      }
      if (product.kind === 'DIGITAL' && !product.digitalAccessUrl) {
        throw new ConflictException('Este producto digital aún no tiene su acceso disponible.');
      }
      if (item.quantity > 20) {
        throw new BadRequestException('Máximo 20 unidades por producto.');
      }
      let unitCents = product.basePriceCents;
      let title = product.name;
      let variantId: string | null = null;
      if (product.variants.length) {
        const variant = product.variants.find((v) => v.id === item.variantId);
        if (!variant || !variant.isAvailable) {
          throw new ConflictException(
            `Elige una opción disponible de «${product.name}».`,
          );
        }
        const label = [
          variant.option1Value,
          variant.option2Value,
          variant.option3Value,
        ]
          .filter(Boolean)
          .join(' / ');
        unitCents = variant.priceCents;
        title = label ? `${product.name} · ${label}` : product.name;
        variantId = variant.id;
      } else if (item.variantId) {
        throw new ConflictException(
          'Un producto de tu carrito cambió. Actualiza tu carrito.',
        );
      }
      lines.push({
        productId: product.id,
        variantId,
        title: title.slice(0, 200),
        handle: product.handle,
        quantity: item.quantity,
        unitCents,
        totalCents: unitCents * item.quantity,
        isService: product.kind === 'SERVICE',
        ships: product.kind === 'PRODUCT',
        fulfillment: fulfillmentSnapshot(product),
        coupon: {
          handle: product.handle,
          categories: product.categories,
          brand: product.brand,
          line: product.line,
          isSet: product._count.components > 0,
          unitCents,
          quantity: item.quantity,
        },
      });
    }
    return lines;
  }

  private async findReplay(
    tenantId: string,
    checkoutKey: string,
    requestHash: string,
  ) {
    const existing = await this.prisma.order.findUnique({
      where: { checkoutKey },
      include: { items: true },
    });
    if (!existing) return null;
    if (
      existing.tenantId !== tenantId ||
      existing.requestHash !== requestHash
    ) {
      throw new ConflictException(
        'Esta compra ya se registró con otros datos. Recarga la página.',
      );
    }
    return existing;
  }

  private async owned(
    tenantId: string,
    orderId: string,
    token: string,
  ): Promise<FullOrder> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId, publicToken: token, channel: 'WEB' },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado.');
    return order;
  }

  private async lockOrder(tx: Prisma.TransactionClient, orderId: string) {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
  }

  private assertLive(access: StoreAccess) {
    if (access.isPreview) {
      throw new ForbiddenException('Publica tu tienda para recibir pedidos.');
    }
  }

  private isExpired(order: Pick<Order, 'expiresAt'>): boolean {
    return Boolean(order.expiresAt && order.expiresAt.getTime() <= Date.now());
  }

  /** Home deliveries need a real district and the buyer's acceptance of the reference rate. */
  private deliveryPlace(
    mode: ShippingMode,
    ubigeo: string | undefined,
    acknowledgeRate: boolean | undefined,
  ): UbigeoDistrict | null {
    if (mode === 'PICKUP') return null;
    const place = ubigeo ? findUbigeo(ubigeo) : null;
    if (!place) {
      throw new BadRequestException(
        'Selecciona el departamento, la provincia y el distrito.',
      );
    }
    if (acknowledgeRate !== true) {
      throw new BadRequestException(
        'Acepta la tarifa referencial del envío para continuar.',
      );
    }
    return place;
  }

  private newCode(): string {
    let code = 'P';
    for (let i = 0; i < 6; i++)
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    return code;
  }

  private async view(order: FullOrder): Promise<PublicOrder> {
    const { kinds, digitalAccess } = await orderFulfillment(
      this.prisma,
      order.tenantId,
      order,
    );
    const delivery = order.delivery
      ? (order.delivery as Partial<DeliveryRecord>)
      : null;
    const address = delivery
      ? [
          delivery.address,
          delivery.district,
          delivery.province,
          delivery.department,
        ]
          .filter(Boolean)
          .join(', ')
      : '';
    return {
      id: order.id,
      code: order.code ?? order.id.slice(-6).toUpperCase(),
      token: order.publicToken ?? '',
      status: order.status as PublicOrderStatus,
      paymentState: order.paymentState,
      paymentDetail:
        order.paymentState === 'rejected' ? order.paymentDetail : null,
      currency: order.currency,
      items: order.items.map((item) => ({
        title: item.title,
        handle: item.handle,
        quantity: item.quantity,
        unitCents: item.unitCents,
        totalCents: item.totalCents,
      })),
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      couponCode: order.couponCode,
      shippingCents: order.shippingCents,
      totalCents: order.totalCents,
      customer: {
        name: order.customerName ?? '',
        email: order.customerEmail ?? '',
        phone: order.customerPhone ?? '',
      },
      delivery: delivery
        ? {
            mode: delivery.mode ?? 'PICKUP',
            label: delivery.label ?? '',
            address: address || null,
            eta: delivery.eta ?? null,
          }
        : null,
      serviceNote: order.serviceNote,
      kinds,
      digitalAccess,
      trackingCode: order.trackingCode,
      expiresAt: order.expiresAt?.toISOString() ?? null,
      cancelReason: order.cancelReason,
      createdAt: order.createdAt.toISOString(),
    };
  }
}
