import {
  StoreProductRecord,
  toProductCard,
  toProductDetail,
  toCatalogCard,
} from './storefront-mapper';

function product(
  overrides: Partial<StoreProductRecord> = {},
): StoreProductRecord {
  return {
    handle: 'polo-basico',
    name: 'Polo básico',
    descriptionShort: null,
    descriptionFull: null,
    brand: null,
    categories: ['Polos'],
    basePriceCents: 5900,
    compareAtPriceCents: null,
    currency: 'PEN',
    isAvailable: true,
    stockUnlimited: false,
    stockQty: 3,
    seoTitle: null,
    seoDescription: null,
    variants: [],
    media: [],
    ...overrides,
  };
}

function variant(
  overrides: Partial<StoreProductRecord['variants'][number]> = {},
) {
  return {
    id: 'v1',
    option1Name: 'Talla',
    option1Value: 'M',
    option2Name: null,
    option2Value: null,
    option3Name: null,
    option3Value: null,
    priceCents: 5900,
    isAvailable: true,
    stockQty: null,
    imageUrl: null,
    ...overrides,
  };
}

describe('storefront product mapping', () => {
  it('exposes all variant attributes and explicit stock independently of product stock', () => {
    const options = ['Color', 'Talla', 'Material', 'Capacidad', 'Modelo'].map((name) => ({ name, value: 'A' }));
    const detail = toProductDetail(product({ stockUnlimited: true, variants: [variant({ options, stockQty: 1 })] }), []);
    expect(detail.variants[0]).toMatchObject({ options, label: 'A / A / A / A / A', stockLeft: 1, isAvailable: true });
  });
  it('exposes secondary gallery images, real benefits and bounded stock for quick purchase', () => {
    const card = toCatalogCard(product({
      stockQty: 3, details: { benefits: ['Protección diaria'] },
      media: [
        { url: 'https://cdn/primary.jpg', sortOrder: 0 },
        { url: 'https://cdn/ambient.jpg', sortOrder: 1, kind: 'related' },
        { url: 'https://cdn/secondary.jpg', sortOrder: 2 },
      ],
    }));
    expect(card).toMatchObject({ secondaryImageUrl: 'https://cdn/secondary.jpg', stockLeft: 3, benefit: 'Protección diaria', variants: [] });
    expect(toCatalogCard(product({ stockUnlimited: true })).stockLeft).toBeNull();
    expect(toCatalogCard(product({ variants: [variant()] })).stockLeft).toBeNull();
  });
  it('marks a simple product without stock as unavailable', () => {
    expect(toProductCard(product({ stockQty: 0 })).isAvailable).toBe(false);
    expect(
      toProductCard(product({ stockQty: 0, stockUnlimited: true })).isAvailable,
    ).toBe(true);
  });

  it('uses the lowest variant price and flags varying prices', () => {
    const card = toProductCard(
      product({
        variants: [
          variant({ priceCents: 6900 }),
          variant({ id: 'v2', priceCents: 5900 }),
        ],
      }),
    );
    expect(card.priceCents).toBe(5900);
    expect(card.priceVaries).toBe(true);
    expect(card.hasVariants).toBe(true);
  });

  it('only keeps a compare-at price that is higher than the selling price', () => {
    expect(
      toProductCard(product({ compareAtPriceCents: 7900 })).compareAtPriceCents,
    ).toBe(7900);
    expect(
      toProductCard(product({ compareAtPriceCents: 5000 })).compareAtPriceCents,
    ).toBeNull();
  });

  it('variants without their own stock follow the product stock', () => {
    const detail = toProductDetail(
      product({
        stockQty: 0,
        variants: [
          variant(),
          variant({ id: 'v2', option1Value: 'L', stockQty: 2 }),
        ],
      }),
      [],
    );
    expect(detail.variants.map((item) => item.isAvailable)).toEqual([
      false,
      true,
    ]);
    expect(detail.isAvailable).toBe(true);
    expect(detail.variants[1].label).toBe('L');
  });

  it('orders media and falls back to a variant image', () => {
    const withMedia = toProductCard(
      product({
        media: [
          { url: 'https://cdn/2.jpg', sortOrder: 2 },
          { url: 'https://cdn/1.jpg', sortOrder: 1 },
        ],
      }),
    );
    expect(withMedia.imageUrl).toBe('https://cdn/1.jpg');
    const fromVariant = toProductCard(
      product({ variants: [variant({ imageUrl: 'https://cdn/v.jpg' })] }),
    );
    expect(fromVariant.imageUrl).toBe('https://cdn/v.jpg');
  });

  it('exposes service details only for services and drops unknown modes', () => {
    expect(toProductCard(product())).toMatchObject({
      kind: 'PRODUCT',
      service: null,
    });
    const service = toProductCard(
      product({
        kind: 'SERVICE',
        durationMinutes: 45,
        serviceMode: 'home',
        stockUnlimited: true,
      }),
    );
    expect(service).toMatchObject({
      kind: 'SERVICE',
      service: { durationMinutes: 45, mode: 'home' },
    });
    expect(
      toProductCard(
        product({
          kind: 'SERVICE',
          durationMinutes: null,
          serviceMode: 'moon',
        }),
      ).service,
    ).toEqual({ durationMinutes: null, mode: null });
  });
});
