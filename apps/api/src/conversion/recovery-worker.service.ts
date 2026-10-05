import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_STOREFRONT_URL_TEMPLATE } from '../storefront/storefront-host';
import { StorefrontPublicService } from '../storefront/storefront-public.service';
import { ConversionInfrastructure } from './conversion-infrastructure.service';
import {
  RecoveryMessagingService,
  RecoveryTransportError,
} from './recovery-messaging.service';
import { readRecoveryItems, RecoveryService } from './recovery.service';
import { recoveryToken } from './recovery-token';

type DeliveryJob = { tenantId: string; deliveryId: string };
const QUEUE = 'store-cart-recovery';
const MAX_ATTEMPTS = 5;

@Injectable()
export class RecoveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecoveryWorker.name);
  private queue?: Queue<DeliveryJob>;
  private worker?: Worker<DeliveryJob>;
  private timer?: NodeJS.Timeout;
  private reconciling = false;
  constructor(
    private readonly infra: ConversionInfrastructure,
    private readonly prisma: PrismaService,
    private readonly recovery: RecoveryService,
    private readonly messaging: RecoveryMessagingService,
    private readonly storefront: StorefrontPublicService,
  ) {}
  onModuleInit(): void {
    if (this.infra.config.get<string>('NODE_ENV') === 'test') return;
    this.timer = setInterval(
      () =>
        void this.reconcile().catch(() =>
          this.logger.warn('Recovery reconciliation unavailable'),
        ),
      30_000,
    );
    this.timer.unref();
    if (!this.infra.connection) return;
    this.queue = new Queue<DeliveryJob>(QUEUE, {
      connection: { ...this.infra.connection, maxRetriesPerRequest: 1 },
      defaultJobOptions: {
        attempts: MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: { count: 500 },
      },
    });
    this.worker = new Worker<DeliveryJob>(QUEUE, (job) => this.deliver(job), {
      connection: this.infra.connection,
      concurrency: 4,
      limiter: { max: 20, duration: 1000 },
    });
    this.queue.on('error', () =>
      this.logger.warn('Recovery queue unavailable'),
    );
    this.worker.on('error', () =>
      this.logger.warn('Recovery worker unavailable'),
    );
    this.worker.on('failed', () =>
      this.logger.warn('Recovery delivery failed; inspect delivery status'),
    );
    void this.reconcile().catch(() =>
      this.logger.warn('Recovery reconciliation unavailable'),
    );
  }
  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.queue?.close();
  }
  async reconcile(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const now = new Date();
      // An interrupted provider request may have delivered. Do not send it again automatically.
      await this.prisma.recoveryDelivery.updateMany({
        where: {
          status: 'SENDING',
          claimedAt: { lt: new Date(now.getTime() - 120_000) },
        },
        data: { status: 'UNCERTAIN' },
      });
      await this.prisma.recoveryCart.deleteMany({
        where: { expiresAt: { lte: now } },
      });
      await this.prisma.storeBehaviorEvent.deleteMany({
        where: { createdAt: { lt: new Date(now.getTime() - 7 * 86400_000) } },
      });
      if (!this.queue) return;
      const pending = await this.prisma.recoveryDelivery.findMany({
        where: {
          status: 'PENDING',
          dueAt: { lte: new Date(now.getTime() + 86400_000) },
        },
        orderBy: { dueAt: 'asc' },
        take: 500,
        select: { id: true, tenantId: true, dueAt: true },
      });
      for (const row of pending) {
        const existing = await this.queue.getJob(row.id);
        if (existing && (await existing.getState()) === 'failed')
          await existing.retry();
        else
          await this.queue.add(
            'reminder',
            { tenantId: row.tenantId, deliveryId: row.id },
            {
              jobId: row.id,
              delay: Math.max(0, row.dueAt.getTime() - now.getTime()),
            },
          );
      }
    } finally {
      this.reconciling = false;
    }
  }
  async deliver(job: Pick<Job<DeliveryJob>, 'data'>): Promise<void> {
    const { tenantId, deliveryId } = job.data;
    const row = await this.prisma.recoveryDelivery.findFirst({
      where: { id: deliveryId, tenantId },
      include: { cart: true },
    });
    if (!row || row.status !== 'PENDING') return;
    const cart = row.cart;
    const settings = await this.recovery.settings(tenantId);
    const now = new Date();
    const consent =
      row.channel === 'EMAIL'
        ? settings.emailEnabled && cart.emailConsentAt && cart.email
        : settings.whatsappEnabled &&
          settings.whatsappTemplate &&
          cart.whatsappConsentAt &&
          cart.phone;
    if (
      !settings.recoveryEnabled ||
      !consent ||
      cart.revokedAt ||
      cart.orderId ||
      cart.expiresAt <= now ||
      cart.revision !== row.revision ||
      settings.delaysMinutes[row.step] === undefined
    ) {
      await this.status(tenantId, row.id, 'CANCELLED');
      return;
    }
    const due =
      cart.lastActivityAt.getTime() + settings.delaysMinutes[row.step] * 60_000;
    if (due > now.getTime()) {
      await this.prisma.recoveryDelivery.updateMany({
        where: { id: row.id, tenantId, status: 'PENDING' },
        data: { dueAt: new Date(due) },
      });
      return;
    }
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: { storefront: true },
    });
    const completedCheckout = await this.prisma.order.findFirst({
      where: {
        tenantId,
        channel: 'WEB',
        status: {
          in: ['PENDING_PAYMENT', 'PAID', 'FULFILLING', 'SHIPPED', 'COMPLETED'],
        },
        createdAt: { gte: cart.createdAt },
        OR: [
          ...(cart.email ? [{ customerEmail: cart.email }] : []),
          ...(cart.phone
            ? [
                { customerPhone: cart.phone },
                ...(cart.phone.startsWith('51')
                  ? [{ customerPhone: cart.phone.slice(2) }]
                  : []),
              ]
            : []),
        ],
      },
      select: { id: true },
    });
    if (completedCheckout) {
      await this.prisma.recoveryCart.updateMany({
        where: { id: cart.id, tenantId },
        data: {
          orderId: completedCheckout.id,
          email: null,
          phone: null,
          emailConsentAt: null,
          whatsappConsentAt: null,
        },
      });
      await this.status(tenantId, row.id, 'CANCELLED');
      return;
    }
    try {
      await this.storefront.access(tenant.slug);
    } catch {
      await this.status(tenantId, row.id, 'CANCELLED');
      return;
    }
    const available = await this.recovery.lines(
      tenantId,
      readRecoveryItems(cart.items),
    );
    if (!available.lines.length || !tenant.storefront) {
      await this.status(tenantId, row.id, 'CANCELLED');
      return;
    }
    const recentOrders =
      row.channel === 'EMAIL'
        ? await this.prisma.order.count({
            where: {
              tenantId,
              status: { in: ['PAID', 'FULFILLING', 'SHIPPED', 'COMPLETED'] },
              createdAt: { gte: new Date(Date.now() - 30 * 86400_000) },
              items: {
                some: {
                  product: {
                    tenantId,
                    handle: { in: available.lines.map((line) => line.handle) },
                  },
                },
              },
            },
          })
        : 0;
    const claim = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "RecoveryCart" WHERE id = ${cart.id} AND "tenantId" = ${tenantId} FOR UPDATE`,
      );
      const count = await tx.recoveryDelivery.count({
        where: {
          tenantId,
          cartId: cart.id,
          channel: row.channel,
          status: { in: ['SENT', 'PREVIEW', 'UNCERTAIN', 'SENDING'] },
        },
      });
      if (count >= 3) {
        await tx.recoveryDelivery.updateMany({
          where: { id: row.id, tenantId, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
        return { count: 0 };
      }
      return tx.recoveryDelivery.updateMany({
        where: {
          id: row.id,
          tenantId,
          status: 'PENDING',
          cart: {
            revision: row.revision,
            revokedAt: null,
            orderId: null,
            expiresAt: { gt: now },
            lastActivityAt: {
              lte: new Date(
                now.getTime() - settings.delaysMinutes[row.step] * 60_000,
              ),
            },
          },
        },
        data: { status: 'SENDING', claimedAt: now, attempts: { increment: 1 } },
      });
    });
    if (!claim.count) return;
    const token = recoveryToken(
      this.infra.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      tenantId,
      cart.id,
      cart.expiresAt,
    );
    const origin =
      this.infra.config.get<string>('STOREFRONT_URL_TEMPLATE') ||
      DEFAULT_STOREFRONT_URL_TEMPLATE;
    const url = `${origin.replace('{slug}', tenant.slug).replace(/\/$/, '')}/carrito?recover=${encodeURIComponent(token)}`;
    const optOut = `${origin.replace('{slug}', tenant.slug).replace(/\/$/, '')}/carrito?stop=${encodeURIComponent(token)}`;
    try {
      // Recheck after claiming to handle concurrent contact edits/revocation/reservation.
      const current = await this.prisma.recoveryCart.findFirst({
        where: {
          id: cart.id,
          tenantId,
          revision: row.revision,
          revokedAt: null,
          orderId: null,
          expiresAt: { gt: new Date() },
        },
      });
      const currentSettings = await this.recovery.settings(tenantId);
      const currentConsent =
        row.channel === 'EMAIL'
          ? currentSettings.emailEnabled &&
            current?.emailConsentAt &&
            current.email
          : currentSettings.whatsappEnabled &&
            currentSettings.whatsappTemplate &&
            current?.whatsappConsentAt &&
            current.phone;
      if (!current || !currentSettings.recoveryEnabled || !currentConsent) {
        await this.status(tenantId, row.id, 'CANCELLED', 'SENDING');
        return;
      }
      const outcome =
        row.channel === 'EMAIL'
          ? await this.messaging.email(
              current.email!,
              tenant.storefront.displayName,
              url,
              optOut,
              row.id,
              {
                lines: available.lines,
                expiresAt: cart.expiresAt,
                recentOrders,
                step: row.step,
              },
            )
          : await this.messaging.whatsapp(
              tenantId,
              current.phone!,
              tenant.storefront.displayName,
              currentSettings.whatsappTemplate!,
              currentSettings.whatsappLanguage,
              url,
              optOut,
            );
      await this.prisma.recoveryDelivery.updateMany({
        where: { id: row.id, tenantId, status: 'SENDING' },
        data: {
          status: outcome === 'sent' ? 'SENT' : 'PREVIEW',
          sentAt: new Date(),
        },
      });
    } catch (error) {
      const outcome =
        error instanceof RecoveryTransportError ? error.outcome : 'uncertain';
      if (outcome === 'retry' && row.attempts + 1 < MAX_ATTEMPTS) {
        await this.prisma.recoveryDelivery.updateMany({
          where: { id: row.id, tenantId, status: 'SENDING' },
          data: {
            status: 'PENDING',
            dueAt: new Date(Date.now() + 30_000 * 2 ** row.attempts),
          },
        });
        throw new Error('Recovery provider throttled');
      }
      await this.status(
        tenantId,
        row.id,
        outcome === 'failed' || outcome === 'retry' ? 'FAILED' : 'UNCERTAIN',
        'SENDING',
      );
    }
  }
  private async status(
    tenantId: string,
    id: string,
    status: string,
    expectedStatus = 'PENDING',
  ) {
    await this.prisma.recoveryDelivery.updateMany({
      where: { id, tenantId, status: expectedStatus },
      data: { status },
    });
  }
}
