import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { SalesAgentToolsService } from './sales-agent-tools.service';
import { SalesToolRegistry } from './sales-tool-registry.service';

describe('Sales tool registry boundaries', () => {
  const products = jest.fn().mockResolvedValue([]);
  const order = jest.fn().mockResolvedValue(null);
  const registry = new SalesToolRegistry(
    { getProducts: products } as unknown as SalesAgentToolsService,
    {} as KnowledgeService,
    { order: { findFirst: order } } as unknown as PrismaService,
    {
      get: (_: string, defaultValue: unknown) => defaultValue,
    } as ConfigService,
  );
  beforeEach(() => jest.clearAllMocks());
  it('rejects tenant/SQL/unknown arguments without touching a service', async () => {
    for (const args of [
      { productId: 'p', tenantId: 'other' },
      { productId: 123 },
      { sql: 'SELECT *' },
    ]) {
      expect(
        (await registry.execute({ tenantId: 'a' }, 'get_product', args)).trace
          .status,
      ).toBe('error');
    }
    expect(products).not.toHaveBeenCalled();
    expect(
      (await registry.execute({ tenantId: 'a' }, 'create_order', {})).trace
        .status,
    ).toBe('error');
  });
  it('hydrates product IDs inside the backend tenant context', async () => {
    const result = await registry.execute(
      { tenantId: 'a' },
      'check_inventory',
      { productId: 'foreign' },
    );
    expect(products).toHaveBeenCalledWith('a', ['foreign']);
    expect(result.value).toEqual({ error: 'PRODUCT_NOT_FOUND' });
  });
  it('does not expose another buyer order even within the same tenant', async () => {
    await registry.execute(
      { tenantId: 'a', conversationId: 'conversation' },
      'get_order_status',
      { orderId: 'order' },
    );
    expect(order.mock.calls[0][0].where).toEqual({
      tenantId: 'a',
      conversationId: 'conversation',
      id: 'order',
    });
  });
  it('refuses an LLM-provided shipping subtotal that was not grounded', async () => {
    const result = await registry.execute(
      { tenantId: 'a', authoritativeSubtotal: 15000 },
      'calculate_shipping',
      { query: 'Miraflores Lima', subtotalCents: 1 },
    );
    expect(result.value).toEqual({ error: 'SUBTOTAL_NOT_GROUNDED' });
  });
});
