import { CatalogProductView, SalesAgentToolsService } from './sales-agent-tools.service';

const tools = new SalesAgentToolsService(null as never, null as never, null as never);

const product = (handle: string, priceCents: number, variants: CatalogProductView['variants'] = []): CatalogProductView => ({
  id: `id-${handle}`,
  handle,
  name: handle,
  descriptionShort: null,
  basePriceCents: priceCents,
  currency: 'PEN',
  categories: [],
  isAvailable: true,
  stockUnlimited: true,
  stockQty: null,
  stockLabel: 'Stock ilimitado',
  priceLabel: `PEN ${(priceCents / 100).toFixed(2)}`,
  productUrl: null,
  variants,
});

describe('SalesAgentToolsService product references', () => {
  it('reads cart lines with quantity and variant', () => {
    const text = [
      'Hola Café Consola, quiero hacer este pedido:',
      '• 2 × Café de altura — S/ 76.00 [P-cafe-de-altura]',
      '• 1 × Polo (M / Negro) — S/ 45.00 [P-polo-basico:cmur4h7sy0007o63j0ek23stc]',
      'Subtotal: S/ 121.00',
    ].join('\n');
    expect(tools.extractProductRefs(text)).toEqual([
      { handle: 'cafe-de-altura', variantId: null, quantity: 2, fromCart: true },
      { handle: 'polo-basico', variantId: 'cmur4h7sy0007o63j0ek23stc', quantity: 1, fromCart: true },
    ]);
  });

  it('reads the product page reference without treating it as an order', () => {
    expect(tools.extractProductRefs('Hola, me interesa este producto. Ref: P-cafe-de-altura')).toEqual([
      { handle: 'cafe-de-altura', variantId: null, quantity: 1, fromCart: false },
    ]);
  });

  it('caps quantities and ignores text without references', () => {
    expect(tools.extractProductRefs('• 500 × Café — S/ 1.00 [P-cafe]')[0].quantity).toBe(99);
    expect(tools.extractProductRefs('Hola, ¿tienen café?')).toEqual([]);
  });

  it('prices order lines from the catalog and drops unknown products or variants', () => {
    const catalog = [
      product('cafe', 3800),
      product('polo', 4500, [
        { id: 'variantm000001', label: 'M', priceCents: 5000, priceLabel: 'PEN 50.00', stockLabel: '3 en stock', isAvailable: true },
      ]),
    ];
    const lines = tools.orderLinesFromRefs(
      [
        { handle: 'cafe', variantId: null, quantity: 2, fromCart: true },
        { handle: 'polo', variantId: 'variantm000001', quantity: 1, fromCart: true },
        { handle: 'polo', variantId: 'variantx999999', quantity: 1, fromCart: true },
        { handle: 'ghost', variantId: null, quantity: 1, fromCart: true },
        { handle: 'cafe', variantId: null, quantity: 1, fromCart: false },
      ],
      catalog,
    );
    expect(lines.map((line) => [line.product.handle, line.variant?.priceCents ?? line.product.basePriceCents, line.quantity])).toEqual([
      ['cafe', 3800, 2],
      ['polo', 5000, 1],
    ]);
  });

  it('puts referenced products first in the catalog search', () => {
    const catalog = [product('te-verde', 2000), product('cafe', 3800)];
    const { matches } = tools.searchCatalog('quiero té verde', catalog, [
      { handle: 'cafe', variantId: null, quantity: 1, fromCart: false },
    ]);
    expect(matches.map((item) => item.handle)).toEqual(['cafe']);
  });
});
