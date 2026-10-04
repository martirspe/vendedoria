import {
  CatalogProductView,
  moneyLabel,
  productFacts,
  productKeywords,
  SalesAgentToolsService,
  serviceLabel,
} from './sales-agent-tools.service';

describe('moneyLabel', () => {
  it('writes soles with their symbol and keeps other currency codes', () => {
    expect(moneyLabel('PEN', 9890)).toBe('S/ 98.90');
    expect(moneyLabel('USD', 1000)).toBe('USD 10.00');
  });
});

describe('productFacts', () => {
  it('keeps the published details and drops empty or malformed ones', () => {
    expect(
      productFacts({
        size: '100 ml',
        family: '',
        notes: [],
        highlights: ['Menta · mandarina · sándalo', 3],
        scent: [{ name: 'Salida', description: 'Menta' }, {}],
        montage: false,
      }),
    ).toEqual({
      size: '100 ml',
      highlights: ['Menta · mandarina · sándalo'],
      scent: ['Salida: Menta'],
    });
    expect(productFacts(null)).toBeUndefined();
    expect(productFacts({ notes: [] })).toBeUndefined();
  });

  it('flattens specifications and product questions for the prompt', () => {
    expect(
      productFacts({
        audience: 'Piel seca',
        attributes: [{ name: 'Material', value: 'Algodón' }, { name: 'Vacío' }],
        faqs: [{ question: '¿Destiñe?', answer: 'No.' }],
        contents: ['Estuche'],
        keywords: ['polera'],
      }),
    ).toEqual({
      audience: 'Piel seca',
      contents: ['Estuche'],
      attributes: ['Material: Algodón'],
      faqs: ['¿Destiñe?: No.'],
    });
    expect(productKeywords({ keywords: ['polera', '', 3] })).toEqual(['polera']);
  });
});

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

  it('finds products by their published benefits and long description', () => {
    const catalog = [
      { ...product('crema-a', 4500), facts: { benefits: ['Hidrata la piel seca'] } },
      { ...product('crema-b', 4500), descriptionFull: 'Ideal para piel grasa.' },
      product('perfume', 9000),
    ];
    expect(
      tools.searchCatalog('algo para piel seca', catalog).matches[0]?.handle,
    ).toBe('crema-a');
    expect(
      tools.searchCatalog('tienen para piel grasa?', catalog).matches[0]?.handle,
    ).toBe('crema-b');
  });

  it('treats merchant keywords as synonyms of the product name', () => {
    const catalog = [
      { ...product('polo-basico', 4500), keywords: ['polera', 'camiseta'] },
      product('casaca', 9000),
    ];
    expect(
      tools.searchCatalog('tienen camisetas?', catalog).matches.map((item) => item.handle),
    ).toEqual(['polo-basico']);
  });

  it('exposes the offer price only when it is above the current price', () => {
    const view = (compareAtPriceCents: number | null) =>
      tools['toView']({
        id: 'p1',
        handle: 'polo',
        name: 'Polo',
        descriptionShort: null,
        descriptionFull: `  ${'a'.repeat(700)}  `,
        basePriceCents: 5000,
        compareAtPriceCents,
        currency: 'PEN',
        categories: [],
        isAvailable: true,
        stockUnlimited: true,
        stockQty: null,
      });
    expect(view(7000).compareAtPriceLabel).toBe('S/ 70.00');
    expect(view(4000).compareAtPriceLabel).toBeNull();
    expect(view(null).compareAtPriceLabel).toBeNull();
    expect(view(null).descriptionFull).toHaveLength(700);
  });
});

describe('SalesAgentToolsService catalog browsing', () => {
  it('derives availability from variant and set stock instead of the enabled flag alone', () => {
    const record = { id: 'p', handle: 'polo', name: 'Polo', descriptionShort: null, basePriceCents: 5000,
      currency: 'PEN', categories: [], isAvailable: true, stockUnlimited: false, stockQty: 0 };
    const variant = { id: 'v', option1Name: 'Talla', option1Value: 'M', option2Name: null, option2Value: null,
      priceCents: 6500, isAvailable: true, stockQty: 2 };
    expect(tools['toView']({ ...record, variants: [variant] })).toMatchObject({ isAvailable: true, basePriceCents: 6500,
      stockLabel: 'Disponible en variantes' });
    expect(tools['toView']({ ...record, variants: [{ ...variant, stockQty: 0 }] }).isAvailable).toBe(false);
    expect(tools['toView']({ ...record, variants: [{ ...variant, isAvailable: false }] }).isAvailable).toBe(false);
    expect(tools['toView']({ ...record, stockQty: 10, components: [{ quantity: 2,
      component: { isAvailable: true, stockUnlimited: false, stockQty: 3 } }] }).stockLabel).toBe('1 en stock');
    expect(tools['toView']({ ...record, kind: 'DIGITAL' }).isAvailable).toBe(true);
  });

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
      'ok q venden?',
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
    '¿Eres un bot?',
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

  it('ranks words of the product name above loose description hits', () => {
    const lipstick = {
      ...named('labial', 'Labial Larga Duración'),
      descriptionShort: 'Labial semimate',
    };
    const { matches } = tools.searchCatalog('y el zentro cuanto dura?', [
      lipstick,
      ...catalog,
    ]);
    expect(matches.map((item) => item.handle)).toEqual(['zentro']);
  });

  it('does not search the catalog for questions about the seller', () => {
    const bottle = {
      ...named('colonia', 'Colonia Floral'),
      descriptionShort: 'Botella de vidrio',
    };
    expect(tools.searchCatalog('eres un bot?', [bottle]).matches).toEqual([]);
  });

  it('detects complaints about an order already placed', () => {
    expect(tools.isOrderComplaint('oigan mi pedido no llega hace una semana!!!')).toBe(true);
    expect(tools.isOrderComplaint('el pedido llegó roto')).toBe(true);
    expect(tools.isOrderComplaint('quiero hacer un pedido')).toBe(false);
    expect(tools.isOrderComplaint('cuanto demora el envio?')).toBe(false);
  });

  it('does not read an order status question as a purchase', () => {
    expect(tools.wantsPurchase('¿Dónde está mi pedido?')).toBe(false);
    expect(tools.wantsPurchase('Quiero comprar un perfume')).toBe(true);
    expect(tools.wantsPurchase('lo quiero')).toBe(true);
    expect(tools.wantsPurchase('el de color me interesa, me lo separas?')).toBe(true);
    expect(tools.wantsPurchase('ya, lo llevo')).toBe(true);
    expect(tools.wantsPurchase('lo voy a pensar')).toBe(false);
  });
});
