import { combinationKey, variantOptions } from './variant-options';

describe('variant options compatibility', () => {
  it('reads legacy pairs and prefers extensible options', () => {
    expect(variantOptions({ option1Name: 'Talla', option1Value: '38' })).toEqual([{ name: 'Talla', value: '38' }]);
    expect(variantOptions({ options: [{ name: 'Color', value: 'Negro' }], option1Name: 'Legacy', option1Value: 'Ignored' })).toEqual([{ name: 'Color', value: 'Negro' }]);
  });
  it('keys combinations independently of attribute order, case and whitespace', () => {
    expect(combinationKey([{ name: 'Color', value: ' Negro ' }, { name: 'Talla', value: '38' }]))
      .toBe(combinationKey([{ name: ' talla ', value: '38' }, { name: 'COLOR', value: 'negro' }]));
  });
  it('supports five attributes and empty legacy records without inventing values', () => {
    expect(variantOptions({})).toEqual([]);
    expect(variantOptions({ options: ['Color', 'Talla', 'Material', 'Capacidad', 'Modelo'].map((name) => ({ name, value: 'A' })) })).toHaveLength(5);
  });
});
