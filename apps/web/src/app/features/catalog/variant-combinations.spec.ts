import { describe, expect, it } from 'vitest';
import { generateCombinations, readOptions } from './variant-combinations';

describe('variant combinations', () => {
  it('generates one or several attributes with independent stock, SKU and price', () => {
    const axes = [{ name: 'Color', values: 'Negro, Blanco' }, { name: 'Talla', values: '38, 39, 40, 41, 42' }];
    const variants = generateCombinations(axes, [], 120, 'SHOE');
    expect(variants).toHaveLength(10);
    expect(new Set(variants.map((variant) => variant.sku)).size).toBe(10);
    expect(variants.every((variant) => variant.stockQty === 0 && variant.priceInherited)).toBe(true);
    expect(generateCombinations(axes.slice(0, 1), [], 10, '')).toHaveLength(2);
  });
  it('keeps identities and edits across generation and removes retired combinations', () => {
    const axes = [{ name: 'Color', values: 'Negro, Blanco' }];
    const initial = generateCombinations(axes, [], 100, 'SHOE');
    const edited = { ...initial[0], id: 'persistent', stockQty: 7, sku: 'MANUAL', price: 89, priceInherited: false, imageUrl: 'https://cdn.example/photo.webp', isAvailable: false };
    const next = generateCombinations(axes, [edited, initial[1]], 120, 'SHOE');
    expect(next[0]).toEqual(edited);
    expect(generateCombinations([{ ...axes[0], values: 'Negro' }], next, 120, 'SHOE')).toEqual([edited]);
    expect(initial[1].stockQty).toBe(0);
  });
  it('rejects duplicate or invalid axes and bounds products before generating', () => {
    expect(() => generateCombinations([{ name: 'Color', values: 'Negro, negro' }], [], 10, '')).toThrow('distintos');
    expect(() => generateCombinations([{ name: '', values: 'A' }], [], 10, '')).toThrow('nombres');
    const many = Array.from({ length: 30 }, (_, i) => String(i)).join(',');
    expect(() => generateCombinations([{ name: 'A', values: many }, { name: 'B', values: many }], [], 10, '')).toThrow('500');
    const maximum = generateCombinations([{ name: 'A', values: many }, { name: 'B', values: '1,2,3,4,5,6,7,8,9,10' }], [], 10, 'SKU');
    expect(maximum).toHaveLength(300);
    expect(generateCombinations(['Color', 'Talla', 'Material', 'Capacidad', 'Modelo'].map((name) => ({ name, values: 'A,B' })), [], 10, '')).toHaveLength(32);
  });
  it('hydrates legacy option pairs and new options without losing the third pair', () => {
    expect(readOptions({ option3Name: 'Material', option3Value: 'Cuero' })).toEqual([{ name: 'Material', value: 'Cuero' }]);
    expect(readOptions({ options: [{ name: 'Modelo', value: 'X' }], option1Value: 'legacy' })).toEqual([{ name: 'Modelo', value: 'X' }]);
  });
});
