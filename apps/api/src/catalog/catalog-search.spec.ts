import { catalogSearchWhere, maximumPrice } from './catalog-search';

describe('catalog search boundaries', () => {
  it('only treats explicit money limits as a budget, not sizes or service durations', () => {
    expect(maximumPrice('perfume hasta S/ 89,90')).toBe(8990);
    expect(maximumPrice('presupuesto de 100 soles')).toBe(10000);
    expect(maximumPrice('un frasco de 100 ml')).toBeUndefined();
    expect(maximumPrice('masaje hasta 60 minutos')).toBeUndefined();
    expect(maximumPrice('capacidad hasta 100 ml')).toBeUndefined();
  });

  it('binds tenant and search text instead of interpolating SQL', () => {
    const { where } = catalogSearchWhere("tenant' OR true --", ["foo'); DROP TABLE Product; --"], { published: true });
    expect(where.values).toContain("tenant' OR true --");
    expect(where.sql).not.toContain('DROP TABLE');
    expect(where.sql).toContain('"tenantId" = ?');
    expect(where.sql).toContain('"isPublishedOnStore" = true');
  });
});
