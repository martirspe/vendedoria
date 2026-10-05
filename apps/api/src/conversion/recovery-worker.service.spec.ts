import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorefrontPublicService } from '../storefront/storefront-public.service';
import { ConversionInfrastructure } from './conversion-infrastructure.service';
import {
  RecoveryMessagingService,
  RecoveryTransportError,
} from './recovery-messaging.service';
import { RecoveryWorker } from './recovery-worker.service';
import { RecoveryService } from './recovery.service';

function build() {
  const cart = {
    id: 'cm00000000000000000000000',
    tenantId: 'tenant-a',
    revision: 1,
    revokedAt: null as Date | null,
    orderId: null as string | null,
    expiresAt: new Date(Date.now() + 86400_000),
    lastActivityAt: new Date(Date.now() - 16 * 60_000),
    createdAt: new Date(Date.now() - 3600_000),
    email: 'buyer@example.test',
    emailConsentAt: new Date(),
    phone: null,
    items: [{ handle: 'item', quantity: 1 }],
  };
  const row = {
    id: 'delivery',
    tenantId: 'tenant-a',
    status: 'PENDING',
    revision: 1,
    step: 0,
    attempts: 0,
    channel: 'EMAIL',
    cart,
  };
  const prisma = {
    recoveryDelivery: {
      findFirst: jest.fn().mockResolvedValue(row),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    recoveryCart: {
      findFirst: jest.fn().mockResolvedValue(cart),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    order: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        slug: 'shop',
        storefront: { displayName: 'Shop' },
      }),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (work: (tx: typeof prisma) => unknown) => work(prisma),
  );
  const recovery = {
    settings: jest.fn().mockResolvedValue({
      recoveryEnabled: true,
      emailEnabled: true,
      delaysMinutes: [15, 120, 1440],
    }),
    lines: jest
      .fn()
      .mockResolvedValue({ lines: [{ handle: 'item' }], changed: false }),
  };
  const messaging = {
    email: jest.fn().mockResolvedValue('sent'),
    whatsapp: jest.fn(),
  };
  const storefront = {
    access: jest
      .fn()
      .mockResolvedValue({ tenantId: 'tenant-a', isPreview: false }),
  };
  const infra = {
    config: new ConfigService({
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      STOREFRONT_URL_TEMPLATE: 'https://{slug}.example.test',
    }),
  };
  const worker = new RecoveryWorker(
    infra as ConversionInfrastructure,
    prisma as unknown as PrismaService,
    recovery as unknown as RecoveryService,
    messaging as unknown as RecoveryMessagingService,
    storefront as unknown as StorefrontPublicService,
  );
  return { worker, row, cart, prisma, recovery, messaging };
}
const job = { data: { tenantId: 'tenant-a', deliveryId: 'delivery' } };
describe('RecoveryWorker delivery safety', () => {
  it('sends once after an atomic, tenant-scoped database claim', async () => {
    const fixture = build();
    await fixture.worker.deliver(job);
    expect(fixture.prisma.recoveryDelivery.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'delivery', tenantId: 'tenant-a' },
      }),
    );
    expect(fixture.messaging.email).toHaveBeenCalledTimes(1);
    expect(fixture.prisma.recoveryDelivery.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SENT' }),
      }),
    );
    fixture.row.status = 'SENT';
    await fixture.worker.deliver(job);
    expect(fixture.messaging.email).toHaveBeenCalledTimes(1);
  });
  it.each([
    'revoked',
    'reserved',
    'no-consent',
    'old-revision',
    'expired',
    'disabled',
  ])('does not send when %s', async (reason) => {
    const fixture = build();
    if (reason === 'revoked') fixture.cart.revokedAt = new Date();
    if (reason === 'reserved') fixture.cart.orderId = 'order';
    if (reason === 'no-consent')
      Object.assign(fixture.cart, { emailConsentAt: null });
    if (reason === 'old-revision') fixture.cart.revision = 2;
    if (reason === 'expired') fixture.cart.expiresAt = new Date(0);
    if (reason === 'disabled')
      fixture.recovery.settings.mockResolvedValue({ recoveryEnabled: false });
    await fixture.worker.deliver(job);
    expect(fixture.messaging.email).not.toHaveBeenCalled();
  });
  it('does not send after another checkout for the same contact', async () => {
    const fixture = build();
    fixture.prisma.order.findFirst.mockResolvedValue({ id: 'new-order' });
    await fixture.worker.deliver(job);
    expect(fixture.messaging.email).not.toHaveBeenCalled();
  });
  it('rechecks a channel disabled between the database claim and provider request', async () => {
    const fixture = build();
    fixture.recovery.settings
      .mockResolvedValueOnce({
        recoveryEnabled: true,
        emailEnabled: true,
        delaysMinutes: [15, 120, 1440],
      })
      .mockResolvedValue({ recoveryEnabled: false });
    await fixture.worker.deliver(job);
    expect(fixture.messaging.email).not.toHaveBeenCalled();
    expect(fixture.prisma.recoveryDelivery.updateMany).toHaveBeenLastCalledWith(
      {
        where: { id: 'delivery', tenantId: 'tenant-a', status: 'SENDING' },
        data: { status: 'CANCELLED' },
      },
    );
  });
  it('does not overwrite a concurrent delivery claim when cancelling an obsolete snapshot', async () => {
    const fixture = build();
    fixture.cart.revokedAt = new Date();
    await fixture.worker.deliver(job);
    expect(fixture.prisma.recoveryDelivery.updateMany).toHaveBeenCalledWith({
      where: { id: 'delivery', tenantId: 'tenant-a', status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
  });
  it('does not send if another worker claimed it or the per-channel cap is reached', async () => {
    const fixture = build();
    fixture.prisma.recoveryDelivery.updateMany.mockResolvedValue({ count: 0 });
    await fixture.worker.deliver(job);
    expect(fixture.messaging.email).not.toHaveBeenCalled();
    fixture.prisma.recoveryDelivery.count.mockResolvedValue(3);
    await fixture.worker.deliver(job);
    expect(fixture.messaging.email).not.toHaveBeenCalled();
  });
  it('marks an ambiguous provider outcome uncertain and only retries a known throttle', async () => {
    const fixture = build();
    fixture.messaging.email.mockRejectedValue(
      new RecoveryTransportError('uncertain'),
    );
    await fixture.worker.deliver(job);
    expect(fixture.prisma.recoveryDelivery.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { status: 'UNCERTAIN' } }),
    );
    fixture.messaging.email.mockRejectedValue(
      new RecoveryTransportError('retry'),
    );
    await expect(fixture.worker.deliver(job)).rejects.toThrow(
      'Recovery provider throttled',
    );
    expect(fixture.prisma.recoveryDelivery.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
  });
  it('postpones delivery after recovery-link activity', async () => {
    const fixture = build();
    fixture.cart.lastActivityAt = new Date();
    await fixture.worker.deliver(job);
    expect(fixture.messaging.email).not.toHaveBeenCalled();
    expect(fixture.prisma.recoveryDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { dueAt: expect.any(Date) } }),
    );
  });
});
