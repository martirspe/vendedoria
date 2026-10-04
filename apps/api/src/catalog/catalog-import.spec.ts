import {
  ExistingProduct,
  imageKey,
  keepConsoleDetails,
  parseCatalogPackage,
  PlanContext,
  planImport,
} from './catalog-import';

describe('keepConsoleDetails', () => {
  it('replaces the imported fields and keeps the ones written in the console', () => {
    expect(
      keepConsoleDetails(
        { size: '30 ml', benefits: ['Viejo'], faqs: [{ question: '¿A?', answer: 'B' }] },
        { size: '50 ml', benefits: [] },
      ),
    ).toEqual({ size: '50 ml', benefits: [], faqs: [{ question: '¿A?', answer: 'B' }] });
    expect(keepConsoleDetails(null, { size: null })).toEqual({ size: null });
  });
});

const product = (
  slug: string,
  sku: string,
  extra: Record<string, unknown> = {},
) => ({
  slug,
  name: `Producto ${slug}`,
  category: 'Perfumería',
  priceCents: 1500,
  active: true,
  content: {
    format: 'individual',
    summary: 'Resumen corto',
    images: [
      {
        url: `/images/products/${slug}/foto-1.jpg`,
        alt: 'Foto',
        kind: 'component',
      },
    ],
    includes: [{ name: slug, size: '50 ml', details: ['Detalle'] }],
    inventory: [{ sku, quantity: 1 }],
  },
  ...extra,
});

const set = (slug: string, skus: string[]) => ({
  slug,
  name: `Set ${slug}`,
  category: 'Sets',
  priceCents: 5000,
  active: true,
  content: {
    format: 'set',
    inventory: skus.map((sku) => ({ sku, quantity: 1 })),
    images: [],
  },
});

const pkg = (products: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    source: 'Prueba',
    products,
    inventory: [
      { sku: 'A1', stock: 4 },
      { sku: 'B1', stock: 2 },
    ],
    ...extra,
  });

const existing = (
  handle: string,
  extra: Partial<ExistingProduct> = {},
): ExistingProduct => ({
  id: `id-${handle}`,
  handle,
  name: handle,
  basePriceCents: 1200,
  isPublishedOnStore: true,
  stockUnlimited: false,
  stockQty: 9,
  variantCount: 0,
  usedInSets: [],
  ...extra,
});

const ctx = (overrides: Partial<PlanContext> = {}): PlanContext => ({
  existing: [],
  files: new Map([
    ['a/foto-1.jpg', 'h-a'],
    ['b/foto-1.jpg', 'h-b'],
  ]),
  stored: new Map(),
  options: {
    updatePrices: false,
    updateStock: false,
    fullSync: false,
    applyStoreSettings: false,
  },
  usage: { used: 0, quota: 100, expired: false },
  store: {
    industry: 'general',
    template: 'classic',
    freeShippingFromCents: null,
    shippingOriginUbigeo: null,
    hasCarrierRates: false,
    heroImageUrl: null,
    bannerImageUrl: null,
  },
  ...overrides,
});

describe('imageKey', () => {
  it('normalizes package paths and rejects remote or escaping ones', () => {
    expect(imageKey('/images/products/item-1/foto-1.jpg')).toBe(
      'item-1/foto-1.jpg',
    );
    expect(imageKey('images/item-1/foto-1.JPG')).toBe('item-1/foto-1.JPG');
    expect(imageKey('item-1\\foto-1.webp')).toBe('item-1/foto-1.webp');
    expect(imageKey('https://cdn.example.com/a.jpg')).toBeNull();
    expect(imageKey('//cdn.example.com/a.jpg')).toBeNull();
    expect(imageKey('../secret/a.jpg')).toBeNull();
    expect(imageKey('item-1/notes.txt')).toBeNull();
  });
});

describe('parseCatalogPackage', () => {
  it('imports digital delivery, services and structured recommendation facts without physical stock', () => {
    const parsed = parseCatalogPackage(pkg([{ slug: 'curso', name: 'Curso de fotografía', kind: 'DIGITAL',
      digitalAccessUrl: 'https://example.com/curso', digitalInstructions: 'Usa el correo de tu compra.', priceCents: 9900,
      content: { details: { useCases: ['Fotografía de productos'], exclusions: ['No incluye cámara'],
        compatibility: ['Navegador actualizado'], digitalFormat: 'Video', license: 'Uso personal', accessDuration: '12 meses',
        attributes: [{ name: 'Idioma', value: 'Español' }], faqs: [{ question: '¿Horario?', answer: 'A tu ritmo.' }] } },
    }, { slug: 'sesion', name: 'Sesión de fotografía', kind: 'SERVICE', durationMinutes: 60, serviceMode: 'home',
      priceCents: 12000, content: { details: { coverage: 'Lima', requirements: ['Preparar los productos'], cancellation: 'Avisar 24 horas antes' } },
    }]));
    expect(parsed.issues).toEqual([]);
    expect(parsed.products[0]).toMatchObject({ kind: 'DIGITAL', digitalAccessUrl: 'https://example.com/curso', holdsStock: false,
      details: { license: 'Uso personal', compatibility: ['Navegador actualizado'], attributes: [{ name: 'Idioma', value: 'Español' }] } });
    expect(parsed.products[1]).toMatchObject({ kind: 'SERVICE', serviceMode: 'home', durationMinutes: 60, holdsStock: false });
    expect(planImport(parsed, ctx()).issues).toEqual([]);
    expect(planImport(parsed, ctx()).products[0].commerce).toMatchObject({ stockUnlimited: true, stockQty: null });
  });

  it('rejects unsafe digital links, unsupported details and nonphysical sets', () => {
    for (const invalid of [
      { kind: 'DIGITAL', digitalAccessUrl: 'http://example.com/file', content: {} },
      { kind: 'DIGITAL', content: {} },
      { kind: 'SERVICE', content: { format: 'set' } },
      { content: { details: { compatibility: 'Inventado', unknown: true } } },
    ]) {
      expect(parseCatalogPackage(pkg([product('bad', 'A1', invalid)])).issues.some((issue) => issue.level === 'error')).toBe(true);
    }
  });

  it('preserves kind and stock when reimporting a legacy file over an existing digital', () => {
    const parsed = parseCatalogPackage(pkg([product('a', 'A1')]));
    const plan = planImport(parsed, ctx({ existing: [existing('a', { kind: 'DIGITAL', stockUnlimited: true, stockQty: null })],
      options: { updatePrices: true, updateStock: true, fullSync: false, applyStoreSettings: false } }));
    expect(plan.products[0].commerce.stockQty).toBeUndefined();
    expect(plan.products[0].product.kind).toBeUndefined();
  });

  it('rejects invalid JSON and empty packages', () => {
    expect(parseCatalogPackage('{nope').issues[0].level).toBe('error');
    expect(
      parseCatalogPackage(JSON.stringify({ products: [] })).issues[0].message,
    ).toMatch(/no trae productos/);
  });

  it('maps products, stock owners and set pieces', () => {
    const parsed = parseCatalogPackage(
      pkg([product('a', 'A1'), product('b', 'B1'), set('duo', ['A1', 'B1'])]),
    );
    expect(parsed.issues).toEqual([]);
    const [a, , duo] = parsed.products;
    expect(a).toMatchObject({
      handle: 'a',
      sku: 'A1',
      holdsStock: true,
      stockQty: 4,
      priceCents: 1500,
    });
    expect(a.images).toEqual([
      { key: 'a/foto-1.jpg', kind: 'image', alt: 'Foto', caption: null },
    ]);
    expect(a.details.size).toBe('50 ml');
    expect(duo).toMatchObject({ holdsStock: false, sku: null, stockQty: null });
    expect(duo.pieces).toEqual([
      { handle: 'a', quantity: 1 },
      { handle: 'b', quantity: 1 },
    ]);
  });

  it('flags bad handles, duplicates, prices and orphan set SKUs', () => {
    const parsed = parseCatalogPackage(
      pkg([
        product('Mal Enlace', 'X'),
        product('a', 'A1'),
        product('a', 'A1'),
        product('c', 'C1', { priceCents: 12.5 }),
        set('duo', ['A1', 'Z9']),
      ]),
    );
    const messages = parsed.issues
      .filter((i) => i.level === 'error')
      .map((i) => i.message);
    expect(messages).toHaveLength(4);
    expect(messages.join(' ')).toMatch(/minúsculas/);
    expect(messages.join(' ')).toMatch(/repetido/);
    expect(messages.join(' ')).toMatch(/céntimos/);
    expect(messages.join(' ')).toMatch(/SKU Z9/);
  });

  it('keeps only valid store settings', () => {
    const parsed = parseCatalogPackage(
      pkg([product('a', 'A1')], {
        store: {
          industry: 'belleza',
          template: 'selecta',
          freeShippingFromCents: 50000,
          shippingOriginUbigeo: '999999',
          carrierRates: { olva: [900, 1200, 1600, 2200, 2800], shalom: [1, 2] },
          heroImage: '/images/products/a/foto-1.jpg',
        },
      }),
    );
    expect(parsed.store).toMatchObject({
      industry: 'belleza',
      template: 'selecta',
      freeShippingFromCents: 50000,
      shippingOriginUbigeo: null,
      carrierRates: { olva: [900, 1200, 1600, 2200, 2800] },
      heroImage: 'a/foto-1.jpg',
    });
    expect(parsed.issues.map((i) => i.message).join(' ')).toMatch(
      /999999.*Shalom|Shalom.*999999/s,
    );
  });
});

describe('planImport', () => {
  const parsed = parseCatalogPackage(
    pkg([product('a', 'A1'), product('b', 'B1'), set('duo', ['A1', 'B1'])]),
  );

  it('creates new products published with their price and stock and asks for missing photos', () => {
    const plan = planImport(
      parsed,
      ctx({ stored: new Map([['h-a', 'https://cdn/x.webp']]) }),
    );
    expect(plan.issues).toEqual([]);
    expect(plan.products[0].commerce).toEqual({
      basePriceCents: 1500,
      isPublishedOnStore: true,
      stockUnlimited: false,
      stockQty: 4,
    });
    expect(plan.products[2].commerce).toMatchObject({
      stockUnlimited: true,
      stockQty: null,
    });
    expect(plan.products[0].media[0].url).toBe('https://cdn/x.webp');
    expect(plan.uploads).toEqual([{ hash: 'h-b', path: 'b/foto-1.jpg' }]);
    expect(plan.usage.after).toBe(3);
  });

  it('keeps console price, stock and publication of existing products by default', () => {
    const plan = planImport(parsed, ctx({ existing: [existing('a')] }));
    expect(plan.products[0].commerce).toEqual({});
  });

  it('prices and publishes an existing product still without price', () => {
    const plan = planImport(
      parsed,
      ctx({
        existing: [
          existing('a', { basePriceCents: 0, isPublishedOnStore: false }),
        ],
      }),
    );
    expect(plan.products[0].commerce).toEqual({
      basePriceCents: 1500,
      isPublishedOnStore: true,
    });
  });

  it('overwrites price and stock only when asked', () => {
    const plan = planImport(
      parsed,
      ctx({
        existing: [existing('a')],
        options: {
          updatePrices: true,
          updateStock: true,
          fullSync: false,
          applyStoreSettings: false,
        },
      }),
    );
    expect(plan.products[0].commerce).toEqual({
      basePriceCents: 1500,
      stockUnlimited: false,
      stockQty: 4,
    });
  });

  it('hides published products missing from the file only on full sync', () => {
    const others = [
      existing('viejo'),
      existing('borrador', { isPublishedOnStore: false }),
    ];
    expect(planImport(parsed, ctx({ existing: others })).hide).toEqual([]);
    const plan = planImport(
      parsed,
      ctx({
        existing: others,
        options: {
          updatePrices: false,
          updateStock: false,
          fullSync: true,
          applyStoreSettings: false,
        },
      }),
    );
    expect(plan.hide.map((row) => row.handle)).toEqual(['viejo']);
  });

  it('blocks imports above the plan quota or with an expired plan', () => {
    expect(
      planImport(
        parsed,
        ctx({ usage: { used: 99, quota: 100, expired: false } }),
      ).issues[0].message,
    ).toMatch(/permite 100 productos/);
    expect(
      planImport(
        parsed,
        ctx({ usage: { used: 0, quota: null, expired: true } }),
      ).issues[0].message,
    ).toMatch(/venció/);
  });

  it('blocks pieces that have variants in the console', () => {
    const plan = planImport(
      parsed,
      ctx({ existing: [existing('a', { variantCount: 2 })] }),
    );
    expect(plan.issues[0]).toMatchObject({ level: 'error', handle: 'a' });
  });

  it('plans store settings only when asked, without overwriting origin, rates or images already set', () => {
    const withStore = parseCatalogPackage(
      pkg([product('a', 'A1')], {
        store: {
          industry: 'belleza',
          template: 'selecta',
          freeShippingFromCents: 50000,
          shippingOriginUbigeo: '150132',
          carrierRates: { olva: [900, 1200, 1600, 2200, 2800] },
          heroImage: 'a/foto-1.jpg',
        },
      }),
    );
    expect(planImport(withStore, ctx()).store).toBeNull();
    const options = {
      updatePrices: false,
      updateStock: false,
      fullSync: false,
      applyStoreSettings: true,
    };
    const fresh = planImport(withStore, ctx({ options }));
    expect(fresh.store?.patch).toMatchObject({
      industry: 'belleza',
      template: 'selecta',
      freeShippingFromCents: 50000,
      shippingOriginUbigeo: '150132',
      heroImageHash: 'h-a',
    });
    const configured = planImport(
      withStore,
      ctx({
        options,
        store: {
          industry: 'belleza',
          template: 'selecta',
          freeShippingFromCents: 50000,
          shippingOriginUbigeo: '150101',
          hasCarrierRates: true,
          heroImageUrl: 'https://cdn/hero.webp',
          bannerImageUrl: null,
        },
      }),
    );
    expect(configured.store?.patch).toEqual({});
  });
});
