import {
  allRecommendedProductIds,
  askedForDistrict,
  awaitingDelivery,
  buildAgentContext,
  confirmsPurchase,
  conversationalIntent,
  lastBrowse,
  lastRecommendedProductIds,
  toWhatsAppText,
  withoutLink,
} from './conversation-context';

describe('askedForDistrict', () => {
  it('is true only while the latest seller message asks for the district', () => {
    expect(askedForDistrict([{ role: 'agent', text: '¿Me confirmas tu distrito para el envío?' }])).toBe(true);
    expect(
      askedForDistrict([
        { role: 'agent', text: '¿A qué distrito?' },
        { role: 'buyer', text: 'espera' },
        { role: 'agent', text: 'Claro, aquí estoy.' },
      ]),
    ).toBe(false);
    expect(askedForDistrict([{ role: 'agent', text: 'Envío a tu distrito', paymentLink: true }])).toBe(false);
  });
});

describe('confirmsPurchase', () => {
  const asked = [{ role: 'agent' as const, text: 'Está a S/ 46. ¿Te lo preparo?' }];

  it('reads a bare yes to the closing question as a purchase', () => {
    for (const text of ['sí', 'Dale!', 'ya pues', 'si porfa 😊']) {
      expect(confirmsPurchase(text, asked)).toBe(true);
    }
    expect(
      confirmsPurchase('si', [{ role: 'agent', text: 'Es ideal para él. ¿Quieres que te lo prepare?' }]),
    ).toBe(true);
  });

  it('ignores a yes to any other question or after the payment link', () => {
    expect(confirmsPurchase('si', [{ role: 'agent', text: '¿Es para ti o para regalar?' }])).toBe(false);
    expect(confirmsPurchase('si, pero en otro color', asked)).toBe(false);
    expect(confirmsPurchase('ok', [{ ...asked[0], paymentLink: true }])).toBe(false);
  });
});

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

describe('pending delivery memory', () => {
  const asked = {
    authorType: 'SALES_AGENT',
    body: '¿A qué distrito te lo enviamos?',
    metadata: {
      tools: [
        {
          name: 'quote_shipping',
          status: 'skipped',
          data: { awaitingDelivery: true, lines: [{ productId: 'p1', variantId: null, quantity: 1 }, { productId: 7 }] },
        },
      ],
    },
  };

  it('keeps the valid lines while the latest seller turn asked for the district', () => {
    const { history } = buildAgentContext([asked, { authorType: 'BUYER', body: 'Miraflores', metadata: null }]);
    expect(awaitingDelivery(history)).toEqual([{ productId: 'p1', variantId: null, quantity: 1 }]);
  });

  it('forgets them once the seller moved on', () => {
    const { history } = buildAgentContext([asked, { authorType: 'SALES_AGENT', body: 'Listo', metadata: null }]);
    expect(awaitingDelivery(history)).toEqual([]);
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

describe('withoutLink', () => {
  const url = 'https://mp.com/checkout?pref=a.1';

  it('removes the URL in any form and keeps the rest of the message', () => {
    expect(withoutLink(`*Total: PEN 10.00*\n\nPaga aquí:\n${url}\n\nGracias`, url)).toBe(
      '*Total: PEN 10.00*\n\nPaga aquí:\n\nGracias',
    );
    expect(withoutLink(`Paga aquí: [link de pago](${url}) ya`, url)).toBe('Paga aquí: ya');
    expect(withoutLink(`Link (${url}) listo`, url)).toBe('Link listo');
    expect(withoutLink(`Paga aquí: <${url}>`, url)).toBe('Paga aquí:');
  });

  it('leaves other links untouched', () => {
    expect(withoutLink('Mira https://tienda.pe/p/1', url)).toBe('Mira https://tienda.pe/p/1');
  });
});

describe('payment link turns', () => {
  it('marks the agent turn that sent a payment link', () => {
    const { history } = buildAgentContext([
      {
        authorType: 'SALES_AGENT',
        body: 'Aquí tienes el link de pago:',
        metadata: { tools: [{ name: 'create_payment_link', data: { checkoutUrl: 'https://mp.com/x' } }] },
      },
      {
        authorType: 'SALES_AGENT',
        body: 'No se pudo generar el link',
        metadata: { tools: [{ name: 'create_payment_link', data: { checkoutUrl: null } }] },
      },
    ]);
    expect(history.map((turn) => turn.paymentLink ?? false)).toEqual([true, false]);
  });
});
