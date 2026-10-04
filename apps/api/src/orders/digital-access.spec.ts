import { orderFulfillment } from './digital-access';

describe('Digital fulfillment snapshots', () => {
  const items = [{ productId: null, title: 'Guía PDF', fulfillment: { kind: 'DIGITAL', url: 'https://example.com/version-1', instructions: 'Descarga el PDF.' } }];

  it('preserves paid access after the product is edited or deleted without querying the catalog', async () => {
    const db = { product: { findMany: jest.fn() } };
    const result = await orderFulfillment(db as never, 'tenant', { status: 'PAID', items });
    expect(result).toEqual({ kinds: ['DIGITAL'], digitalAccess: [{ title: 'Guía PDF', url: 'https://example.com/version-1', instructions: 'Descarga el PDF.' }] });
    expect(db.product.findMany).not.toHaveBeenCalled();
  });

  it.each(['DRAFT', 'PENDING_PAYMENT', 'CANCELLED'] as const)('never reveals access for %s orders', async (status) => {
    expect((await orderFulfillment({} as never, 'tenant', { status, items })).digitalAccess).toEqual([]);
  });
});
