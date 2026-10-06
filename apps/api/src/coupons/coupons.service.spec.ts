import { CouponsService } from './coupons.service';

const automaticCoupon = (overrides: Record<string, unknown> = {}) => ({
  id: 'coupon-1',
  tenantId: 'tenant-1',
  code: 'AUTO-ONE',
  method: 'AUTOMATIC',
  label: '10 % automático',
  note: null,
  kind: 'PERCENT',
  value: 10,
  maxDiscountCents: null,
  buyQuantity: null,
  getQuantity: null,
  maxApplications: null,
  minSubtotalCents: 0,
  minItems: 0,
  scope: 'ALL',
  targets: [],
  applyToSets: true,
  startsAt: null,
  endsAt: null,
  usageLimit: null,
  perCustomerLimit: null,
  firstOrderOnly: false,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('CouponsService automatic discounts', () => {
  it('chooses the eligible automatic discount with the greatest product benefit', async () => {
    const candidates = [
      automaticCoupon({ id: 'small', code: 'AUTO-SMALL', value: 10 }),
      automaticCoupon({ id: 'large', code: 'AUTO-LARGE', value: 20 }),
    ];
    const db = {
      coupon: {
        findMany: jest.fn().mockResolvedValue(candidates),
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(candidates.find((coupon) => coupon.code === where.tenantId_code.code) ?? null),
        ),
      },
      couponRedemption: { count: jest.fn().mockResolvedValue(0) },
      order: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new CouponsService(db as never, {} as never);

    const quote = await service.automaticQuote(db as never, 'tenant-1', {
      lines: [{ handle: 'polo', categories: [], brand: null, line: null, isSet: false, unitCents: 10_000, quantity: 1 }],
      email: 'buyer@example.com',
    });

    expect(quote?.coupon.code).toBe('AUTO-LARGE');
    expect(quote?.discountCents).toBe(2_000);
  });

  it('does not select an automatic discount when none applies to the cart', async () => {
    const db = {
      coupon: { findMany: jest.fn().mockResolvedValue([automaticCoupon({ scope: 'PRODUCTS', targets: ['other'] })]) },
    };
    const service = new CouponsService(db as never, {} as never);

    await expect(
      service.automaticQuote(db as never, 'tenant-1', {
        lines: [{ handle: 'polo', categories: [], brand: null, line: null, isSet: false, unitCents: 10_000, quantity: 1 }],
      }),
    ).resolves.toBeNull();
  });
});
