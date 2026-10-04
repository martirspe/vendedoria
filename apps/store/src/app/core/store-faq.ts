import type { StoreTemplateFaq, StorefrontView } from '@vendedoria/contracts';

/** Rounded amount for marketing lines: 50000 → "S/ 500". */
export function wholeMoney(store: StorefrontView, cents: number): string {
  return new Intl.NumberFormat(`es-${store.country}`, {
    style: 'currency',
    currency: store.currency,
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
}

/** How the template names its buying path in the first answer. */
export type FaqCartCopy = { online: string; whatsapp: string };

/** Answers built from the store settings, so they never promise what the store does not offer. */
export function defaultFaq(store: StorefrontView, cart: FaqCartCopy): StoreTemplateFaq[] {
  const online = store.checkout.mode === 'online';
  const options = store.shipping.options;
  const home = options.filter((o) => o.mode !== 'PICKUP');
  const pickup = options.find((o) => o.mode === 'PICKUP');
  const free = store.shipping.freeShippingFromCents;
  const contact = store.whatsappPhone ? 'Escríbenos por WhatsApp' : 'Escríbenos';
  const hygiene = store.industry === 'belleza';
  const faq: StoreTemplateFaq[] = [
    {
      question: '¿Necesito crear una cuenta para comprar?',
      answer: online ? cart.online : cart.whatsapp,
    },
    {
      question: '¿Qué medios de pago aceptan?',
      answer: online
        ? 'Yape, con tu celular y el código de aprobación de la app, y tarjetas de crédito o débito en una sola cuota. Mercado Pago procesa cada pago: esta tienda no guarda los datos de tu tarjeta ni tu código Yape.'
        : 'Coordinamos el medio de pago contigo por WhatsApp al confirmar tu pedido.',
    },
  ];
  if (home.length) {
    const names = home.map((o) => o.label).join(' o ');
    const from = store.shipping.origin ? ` desde ${store.shipping.origin}` : '';
    const parts = [
      `Enviamos${from} a todo el Perú, sujeto a cobertura, con ${names}.`,
      'Al elegir tu distrito ves el costo antes de pagar: una tarifa referencial según la distancia. Nunca cobramos una diferencia sin tu aprobación.',
    ];
    if (free) parts.push(`En pedidos desde ${wholeMoney(store, free)} el envío es gratis.`);
    faq.push({ question: '¿Cuánto cuesta el envío y a dónde llegan?', answer: parts.join(' ') });
  }
  if (pickup) {
    faq.push({
      question: '¿Puedo recoger mi pedido?',
      answer:
        'Sí, sin costo. Por tu seguridad, la dirección y el horario de recojo llegan en el correo de confirmación una vez acreditado el pago.',
    });
  }
  if (online) {
    faq.push(
      {
        question: '¿Mi producto queda reservado mientras pago?',
        answer:
          'Sí. Al continuar al pago separamos tu selección durante 15 minutos, para que nadie más se lleve la última unidad mientras completas tu compra.',
      },
      {
        question: '¿Cómo sé que mi pago se confirmó?',
        answer:
          'Verificamos el resultado directamente con Mercado Pago y te enviamos un correo con el detalle de tu pedido. Si el pago queda pendiente, espera su verificación antes de intentar pagar otra vez.',
      },
    );
  }
  faq.push({
    question: '¿Qué hago si mi pedido llega con algún problema?',
    answer: `${contact} con tu número de pedido y fotos del producto. Si llegó dañado, vencido, incompleto o es distinto al que pediste, eliges entre la reposición o la devolución de tu dinero, sin costo para ti.`,
  });
  faq.push({
    question: '¿Puedo cambiar un producto si cambio de opinión?',
    answer: store.legal.exchangeDays
      ? hygiene
        ? `Sí, dentro de los ${store.legal.exchangeDays} días calendario siguientes a la recepción, siempre que el producto esté sellado y sin usar. Por higiene, no aceptamos cambios por preferencia de perfumes o cosméticos abiertos. Encuentra el detalle en nuestra Política de Cambios y Devoluciones.`
        : `Sí, dentro de los ${store.legal.exchangeDays} días calendario siguientes a la recepción, siempre que el producto esté sin usar y con su empaque original. Encuentra el detalle en nuestra Política de Cambios y Devoluciones.`
      : hygiene
        ? 'Por higiene, los cambios aplican a productos con fallas o distintos a los que pediste, según la garantía legal. Encuentra el detalle en nuestra Política de Cambios y Devoluciones.'
        : 'Los cambios aplican a productos con fallas o distintos a los que pediste, según la garantía legal. Encuentra el detalle en nuestra Política de Cambios y Devoluciones.',
  });
  return faq;
}
