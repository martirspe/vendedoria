import { catalogContext, CATALOG_CONTEXT_CHARS, promptHistory } from './catalog-context';
import type { CatalogProductView } from './sales-agent-tools.service';

const product = (id: number): CatalogProductView => ({
  id: String(id), handle: `item-${id}`, name: `Producto ${id}`, descriptionShort: 'Ficha',
  basePriceCents: 1000, currency: 'PEN', categories: ['Pruebas'], isAvailable: true,
  stockUnlimited: true, stockQty: null, stockLabel: 'Disponible', priceLabel: 'S/ 10.00',
  isService: false, productUrl: null, imageUrl: null, variants: [],
});

describe('bounded catalog context', () => {
  it('keeps conditions intact and selects the FAQ that answers the current question', () => {
    const p = { ...product(1), facts: {
      cancellation: 'Puedes reprogramar con 24 horas de aviso.',
      exclusions: Array.from({ length: 10 }, (_, i) => `Condición ${i}`),
      faqs: ['Entrega: cinco días', 'Material: algodón', 'Compatibilidad Windows: Windows 11', 'Colores: azul'],
    } };
    const context = catalogContext([p], '¿Es compatible con Windows?');
    expect(context[0]['facts']).toEqual(expect.objectContaining({
      cancellation: p.facts.cancellation, exclusions: p.facts.exclusions,
      faqs: expect.arrayContaining(['Compatibilidad Windows: Windows 11']),
    }));
  });

  it('bounds product context independently of catalog size and identifies omitted details', () => {
    const products = Array.from({ length: 10_000 }, (_, i) => ({ ...product(i), descriptionFull: 'a'.repeat(5000) }));
    const context = catalogContext(products, 'producto');
    expect(context).toHaveLength(3);
    expect(JSON.stringify(context).length).toBeLessThanOrEqual(CATALOG_CONTEXT_CHARS);
  });

  it('bounds history without sending fragments of old messages', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({ text: `${i}${'a'.repeat(1000)}` }));
    const kept = promptHistory(history);
    expect(kept.reduce((sum, turn) => sum + turn.text.length, 0)).toBeLessThanOrEqual(8000);
    expect(kept.at(-1)).toEqual(history.at(-1));
    expect(kept.every((turn) => history.includes(turn))).toBe(true);
  });
});
