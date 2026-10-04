import { productCompleteness } from './product-completeness';

describe('productCompleteness', () => {
  it('scores an empty product at zero and a complete one at 100', () => {
    expect(
      productCompleteness({ kind: 'PRODUCT', categories: [], photos: 0, details: null }).score,
    ).toBe(0);
    expect(
      productCompleteness({
        kind: 'PRODUCT',
        categories: ['Polos'],
        photos: 2,
        descriptionFull: 'Polo de algodón para uso diario.',
        details: {
          audience: 'Uso diario',
          attributes: [{ name: 'Material', value: 'Algodón' }],
          faqs: [{ question: '¿Destiñe?', answer: 'No.' }],
          keywords: ['polera'],
          useCases: ['Uso diario'],
          contents: ['Polo'],
          returns: 'Cambios según la política del negocio.',
        },
      }).score,
    ).toBe(100);
  });

  it('does not mark digital products ready without delivery and usage conditions', () => {
    const { items, score } = productCompleteness({ kind: 'DIGITAL', categories: ['Guías'], photos: 1, details: { benefits: ['Aprender'] } });
    expect(score).toBeLessThan(100);
    expect(items.find((item) => item.id === 'access')?.done).toBe(false);
    expect(items.find((item) => item.id === 'license')?.done).toBe(false);
  });

  it('requests coverage for home services but not online services', () => {
    const input = { kind: 'SERVICE' as const, categories: [], photos: 0, details: null };
    expect(productCompleteness({ ...input, serviceMode: 'home' }).items.some((item) => item.id === 'coverage')).toBe(true);
    expect(productCompleteness({ ...input, serviceMode: 'online' }).items.some((item) => item.id === 'coverage')).toBe(false);
  });

  it('asks services for what they include instead of specifications', () => {
    const { items } = productCompleteness({
      kind: 'SERVICE',
      categories: [],
      photos: 0,
      details: { benefits: ['Relaja'], contents: ['Masaje de 60 min'] },
    });
    expect(items.find((item) => item.id === 'contents')?.done).toBe(true);
    expect(items.some((item) => item.id === 'specs')).toBe(false);
  });
});
