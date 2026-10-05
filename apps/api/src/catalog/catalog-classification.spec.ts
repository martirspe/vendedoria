import { categorySchema, classificationDetails, validateAttributeValues, type CategoryRecord } from './catalog-classification';

const categories: CategoryRecord[] = [
  { id: 'fashion', name: 'Moda', kind: 'PRODUCT', parentId: null, attributes: [{ key: 'material', name: 'Material', required: false }] },
  { id: 'footwear', name: 'Calzado', kind: 'PRODUCT', parentId: 'fashion', attributes: [{ key: 'size', name: 'Talla', required: true, variant: true, values: ['38', '39'] }] },
  { id: 'sneakers', name: 'Zapatillas', kind: 'PRODUCT', parentId: 'footwear', attributes: [{ key: 'material', name: 'Material', required: true }] },
];
describe('catalog classification', () => {
  it('keeps generic facts, removes retired category facts and materializes new values once', () => {
    const details = classificationDetails({ benefits: ['Resistente'], attributes: [{ name: 'Piel', value: 'Seca' }, { name: 'Material', value: 'Old' }, { name: 'Origen', value: 'Perú' }] }, [{ key: 'skin', name: 'Piel' }], [{ key: 'material', name: 'Material' }], { material: 'Cuero' });
    expect(details).toEqual({ benefits: ['Resistente'], attributes: [{ name: 'Origen', value: 'Perú' }, { name: 'Material', value: 'Cuero' }] });
    expect(classificationDetails(null, [], [], {})).toBeNull();
  });
  it('inherits attributes by stable key and overrides them without duplicates', () => {
    const schema = categorySchema(categories, 'sneakers');
    expect(schema.path.map((node) => node.name)).toEqual(['Moda', 'Calzado', 'Zapatillas']);
    expect(schema.attributes).toHaveLength(2);
    expect(schema.attributes[0].required).toBe(true);
    expect(validateAttributeValues(schema.attributes, { material: ' Cuero ' }, ['Talla'])).toEqual({ material: 'Cuero' });
  });
  it('rejects missing requirements, foreign category values and invalid enumerations', () => {
    const schema = categorySchema(categories, 'footwear');
    expect(() => validateAttributeValues(schema.attributes, {})).toThrow('Completa Talla');
    expect(() => validateAttributeValues(schema.attributes, { skin_type: 'Seca' })).toThrow('no pertenecen');
    expect(() => validateAttributeValues(schema.attributes, { size: '45' })).toThrow('no es válido');
    expect(() => validateAttributeValues(schema.attributes, { size: 38 } as unknown as Record<string, string>)).toThrow('texto válido');
  });
  it('rejects cycles, unknown categories and broken ancestry', () => {
    expect(() => categorySchema(categories, 'unknown')).toThrow('no existe');
    expect(() => categorySchema([{ ...categories[0], parentId: 'fashion' }], 'fashion')).toThrow('jerarquía inválida');
    expect(() => categorySchema([{ ...categories[1], parentId: 'missing' }], 'footwear')).toThrow('padre inválido');
  });
});
