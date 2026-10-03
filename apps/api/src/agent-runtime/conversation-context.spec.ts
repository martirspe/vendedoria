import {
  allRecommendedProductIds,
  buildAgentContext,
  conversationalIntent,
  lastBrowse,
  lastRecommendedProductIds,
  toWhatsAppText,
} from './conversation-context';

describe('conversationalIntent', () => {
  it('detects farewells and thanks', () => {
    for (const text of ['Ok, gracias', 'gracias!!', 'Chau 👋', 'Muchas gracias por la ayuda', 'listo, hasta luego']) {
      expect(conversationalIntent(text)).toBe('closing');
    }
  });

  it('detects bare acknowledgements', () => {
    expect(conversationalIntent('Perfecto')).toBe('acknowledgement');
    expect(conversationalIntent('ok 👍')).toBe('acknowledgement');
  });

  it('treats anything with content or a question as a real message', () => {
    expect(conversationalIntent('gracias, quiero comprar el perfume')).toBeNull();
    expect(conversationalIntent('gracias, ¿hacen envíos?')).toBeNull();
    expect(conversationalIntent('sí')).toBeNull();
    expect(conversationalIntent('')).toBeNull();
  });
});

describe('buildAgentContext', () => {
  it('keeps turns in order, reads recommended products and skips photo messages', () => {
    const context = buildAgentContext([
      { authorType: 'BUYER', body: 'Hola', metadata: null },
      {
        authorType: 'SALES_AGENT',
        body: 'Te recomiendo Zentro',
        metadata: { tools: [{ name: 'search_catalog', data: { matchIds: ['p1'] } }] },
      },
      { authorType: 'SALES_AGENT', body: 'Zentro · PEN 120.00', metadata: { kind: 'image', productId: 'p1' } },
      { authorType: 'SYSTEM', body: 'Pedido creado', metadata: null },
    ]);
    expect(context.history).toEqual([
      { role: 'buyer', text: 'Hola' },
      { role: 'agent', text: 'Te recomiendo Zentro', productIds: ['p1'] },
      { role: 'agent', text: 'Pedido creado' },
    ]);
    expect(context.shownImageProductIds).toEqual(['p1']);
    expect(lastRecommendedProductIds(context.history)).toEqual(['p1']);
  });
});

describe('catalog browsing memory', () => {
  it('remembers the last browse and every product already shown', () => {
    const { history } = buildAgentContext([
      {
        authorType: 'SALES_AGENT',
        body: 'Perfumes',
        metadata: { tools: [{ name: 'search_catalog', data: { matchIds: ['p1', 'p2'], browse: true, browseCategory: 'Perfumes' } }] },
      },
      { authorType: 'BUYER', body: 'ver más', metadata: null },
      {
        authorType: 'SALES_AGENT',
        body: 'Más perfumes',
        metadata: { tools: [{ name: 'search_catalog', data: { matchIds: ['p3'], browse: true, browseCategory: 'Perfumes' } }] },
      },
    ]);
    expect(lastBrowse(history)).toEqual({ category: 'Perfumes' });
    expect(allRecommendedProductIds(history)).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('toWhatsAppText', () => {
  it('rewrites Markdown that WhatsApp would show raw', () => {
    expect(toWhatsAppText('Paga aquí: [link de pago](https://mp.com/x) **ya**')).toBe(
      'Paga aquí: link de pago: https://mp.com/x *ya*',
    );
    expect(toWhatsAppText('[https://a.pe](https://a.pe)')).toBe('https://a.pe');
    expect(toWhatsAppText('## Opciones\nUno')).toBe('Opciones\nUno');
  });
});
