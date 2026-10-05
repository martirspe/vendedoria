import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  catalogFilterSql,
  loadCatalogFacets,
  parseCatalogFilters,
} from './catalog-filters';
import { ProductListQueryDto } from './dto/storefront-query.dto';

describe('public catalog filters', () => {
  it('rejects malformed, excessive and unsupported facet selections', () => {
    for (const raw of [
      '{',
      '{}',
      '[null]',
      '[{"key":"tenantId","values":["other"]}]',
      '[{"key":"brand","values":[]}]',
      '[{"key":"brand","values":[12]}]',
      JSON.stringify(
        Array.from({ length: 21 }, (_, index) => ({
          key: 'attribute:' + index,
          values: ['x'],
        })),
      ),
      '[{"key":"brand","values":["A"]},{"key":"brand","values":["B"]}]',
    ]) {
      expect(() => parseCatalogFilters(raw)).toThrow(BadRequestException);
    }
    expect(
      parseCatalogFilters('[{"key":"variant:Talla","values":["M","M","L"]}]'),
    ).toEqual([{ key: 'variant:Talla', values: ['M', 'L'] }]);
  });

  it('binds merchant values and matches all selected options on one variant', () => {
    const hostile = "Rojo' OR true --";
    const sql = catalogFilterSql(
      [
        { key: 'variant:Talla', values: ['M', 'L'] },
        { key: 'variant:Color', values: [hostile] },
        { key: 'attribute:Tipo de piel', values: ['Seca'] },
      ],
      'Moda / Mujer',
    );
    expect(sql.text).not.toContain(hostile);
    expect(sql.values).toContain(hostile);
    expect(sql.values).toContain('Moda > Mujer > ');
    expect(sql.text.match(/FROM "ProductVariant" v/g)).toHaveLength(1);
    expect(sql.text).toContain('v."productId" = p.id');
    expect(sql.values).toEqual(
      expect.arrayContaining(['Talla', 'Color', 'Tipo de piel', 'Seca']),
    );
  });

  it('validates price and payload bounds at the public API boundary', () => {
    for (const input of [
      { minPriceCents: -1 },
      { maxPriceCents: 1.5 },
      { maxPriceCents: 2147483648 },
      { filters: 'x' },
      { filters: ' '.repeat(6001) },
      { pageSize: 49 },
    ]) {
      expect(
        validateSync(plainToInstance(ProductListQueryDto, input)).length,
      ).toBeGreaterThan(0);
    }
    expect(
      validateSync(
        plainToInstance(ProductListQueryDto, {
          minPriceCents: 0,
          maxPriceCents: 1234,
          filters: '[]',
        }),
      ),
    ).toEqual([]);
  });

  it('aggregates groups safely and hides ambiguous mixed-currency price ranges', async () => {
    const db = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          { key: 'category', value: 'Belleza > Rostro', count: 2 },
          { key: 'brand', value: 'Marca A', count: 2 },
          { key: 'attribute:Tipo de piel', value: 'Seca', count: 1 },
        ])
        .mockResolvedValueOnce([
          { currency: 'PEN', minCents: 1000, maxCents: 3000 },
          { currency: 'USD', minCents: 500, maxCents: 1000 },
        ]),
    };
    const where = catalogFilterSql([], 'Belleza');
    const facets = await loadCatalogFacets(db, where);
    expect(facets.price).toBeNull();
    expect(facets.categories).toEqual([
      { value: 'Belleza > Rostro', count: 2 },
    ]);
    expect(facets.groups).toEqual([
      {
        key: 'brand',
        label: 'Marca',
        values: [{ value: 'Marca A', count: 2 }],
      },
      {
        key: 'attribute:Tipo de piel',
        label: 'Tipo de piel',
        values: [{ value: 'Seca', count: 1 }],
      },
    ]);
  });
});
