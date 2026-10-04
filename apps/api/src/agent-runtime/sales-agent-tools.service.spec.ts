import {
  CatalogProductView,
  SalesAgentToolsService,
  serviceLabel,
} from './sales-agent-tools.service';

describe('serviceLabel', () => {
  it('describes the service without stock words', () => {
    expect(serviceLabel(60, 'home')).toBe(
      'Servicio · 60 min aprox. · a domicilio',
    );
    expect(serviceLabel(null, null)).toBe('Servicio');
  });
});

const tools = new SalesAgentToolsService(
  null as never,
  null as never,
  null as never,
);

const product = (
  handle: string,
  priceCents: number,
  variants: CatalogProductView['variants'] = [],
): CatalogProductView => ({
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
  stockLabel: 'Disponible',
  priceLabel: `PEN ${(priceCents / 100).toFixed(2)}`,
  isService: false,
  productUrl: null,
  imageUrl: null,
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
      {
        handle: 'cafe-de-altura',
        variantId: null,
        quantity: 2,
        fromCart: true,
      },
      {
        handle: 'polo-basico',
        variantId: 'cmur4h7sy0007o63j0ek23stc',
        quantity: 1,
        fromCart: true,
      },
    ]);
  });

  it('reads the product page reference without treating it as an order', () => {
    expect(
      tools.extractProductRefs(
        'Hola, me interesa este producto. Ref: P-cafe-de-altura',
      ),
    ).toEqual([
      {
        handle: 'cafe-de-altura',
        variantId: null,
        quantity: 1,
        fromCart: false,
      },
    ]);
  });

  it('caps quantities and ignores text without references', () => {
    expect(
      tools.extractProductRefs('• 500 × Café — S/ 1.00 [P-cafe]')[0].quantity,
    ).toBe(99);
    expect(tools.extractProductRefs('Hola, ¿tienen café?')).toEqual([]);
  });

  it('prices order lines from the catalog and drops unknown products or variants', () => {
    const catalog = [
      product('cafe', 3800),
      product('polo', 4500, [
        {
          id: 'variantm000001',
          label: 'M',
          priceCents: 5000,
          priceLabel: 'PEN 50.00',
          stockLabel: '3 en stock',
          isAvailable: true,
        },
      ]),
    ];
    const lines = tools.orderLinesFromRefs(
      [
        { handle: 'cafe', variantId: null, quantity: 2, fromCart: true },
        {
          handle: 'polo',
          variantId: 'variantm000001',
          quantity: 1,
          fromCart: true,
        },
        {
          handle: 'polo',
          variantId: 'variantx999999',
          quantity: 1,
          fromCart: true,
        },
        { handle: 'ghost', variantId: null, quantity: 1, fromCart: true },
        { handle: 'cafe', variantId: null, quantity: 1, fromCart: false },
      ],
      catalog,
    );
    expect(
      lines.map((line) => [
        line.product.handle,
        line.variant?.priceCents ?? line.product.basePriceCents,
        line.quantity,
      ]),
    ).toEqual([
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

describe('SalesAgentToolsService catalog browsing', () => {
  const overview = {
    total: 30,
    storeUrl: null,
    categories: [
      { label: 'Perfumes', names: ['Perfumes'], count: 20 },
      {
        label: 'Cuidado facial',
        names: ['Cuidado facial', 'cuidado facial'],
        count: 10,
      },
    ],
  };

  it('asks for the whole catalog only with browse words', () => {
    for (const text of [
      'Quiero ver el catálogo',
      '¿Qué productos tienen?',
      'recomiéndame algo',
    ]) {
      expect(tools.browseRequest(text, overview)).toEqual({ kind: 'catalog' });
    }
  });

  it('browses a category named alone, in singular or plural', () => {
    expect(tools.browseRequest('¿Tienen perfumes?', overview)).toEqual({
      kind: 'category',
      category: overview.categories[0],
    });
    expect(tools.browseRequest('muéstrame algo facial', overview)).toEqual({
      kind: 'category',
      category: overview.categories[1],
    });
  });

  it('keeps the regular search when the buyer describes what they want', () => {
    expect(
      tools.browseRequest('quiero un perfume floral', overview),
    ).toBeNull();
    expect(tools.browseRequest('¿tienen otros colores?', overview)).toBeNull();
  });

  it('asks for more of the current listing', () => {
    expect(tools.browseRequest('ver más', overview)).toEqual({ kind: 'more' });
    expect(tools.browseRequest('¿Qué más tienen?', overview)).toEqual({
      kind: 'more',
    });
    expect(tools.browseRequest('muéstrame otros', overview)).toEqual({
      kind: 'more',
    });
  });
});

describe('SalesAgentToolsService human handoff', () => {
  it.each([
    'Quiero hablar con una persona',
    'puedo hablar con un asesor?',
    'Pásame con alguien del equipo',
    'necesito un asesor',
    'quiero atención humana',
    '¿Eres un bot?',
    'no quiero hablar con un robot',
    'hay alguien ahí?',
    'Me comunicas con un humano por favor',
  ])('hands off when the buyer asks for a person: %s', (text) => {
    expect(tools.wantsHuman(text)).toBe(true);
  });

  it.each([
    '¿Alcanza para 4 personas?',
    'Es para una persona mayor',
    'Tienen extensiones de cabello humano?',
    'Quiero el perfume para regalar a una persona especial',
    'el asesoramiento de talla es gratis?',
  ])('keeps selling when "persona" or "humano" is part of the question: %s', (text) => {
    expect(tools.wantsHuman(text)).toBe(false);
  });
});

describe('SalesAgentToolsService purchase intent', () => {
  const named = (handle: string, name: string) => ({
    ...product(handle, 12000),
    name,
  });
  const catalog = [
    named('zentro', 'Zentro Eau de Parfum'),
    named('bloom', 'Bloom Eau de Parfum'),
    named('crema', 'Crema hidratante'),
  ];

  it('identifies a product only when a word names exactly one of them', () => {
    expect(
      tools.identifyProduct('quiero comprar el Zentro', catalog)?.handle,
    ).toBe('zentro');
    expect(
      tools.identifyProduct('quiero comprar un perfume eau de parfum', catalog),
    ).toBeNull();
    expect(tools.identifyProduct('quiero zentro y bloom', catalog)).toBeNull();
  });

  it('matches without accents and ignores intent words in the search', () => {
    const { matches } = tools.searchCatalog(
      'Quiero comprar una crema hidratánte',
      catalog,
    );
    expect(matches.map((item) => item.handle)).toEqual(['crema']);
  });

  it('matches plurals against singular product words', () => {
    const { matches } = tools.searchCatalog('tienen cremas?', catalog);
    expect(matches.map((item) => item.handle)).toEqual(['crema']);
  });

  it('does not read an order status question as a purchase', () => {
    expect(tools.wantsPurchase('¿Dónde está mi pedido?')).toBe(false);
    expect(tools.wantsPurchase('Quiero comprar un perfume')).toBe(true);
    expect(tools.wantsPurchase('lo quiero')).toBe(true);
  });
});
