import { normalizeText } from '../agent-runtime/conversation-context';

export type LiveIntent =
  | 'BUY'
  | 'BUY_QUANTITY'
  | 'PRICE'
  | 'STOCK'
  | 'SHIPPING'
  | 'PAYMENT'
  | 'PRODUCT_INFO'
  | 'CANCEL'
  | 'UNKNOWN';

/** Negation and explicit quantities win over the general purchase verb. */
export function detectLiveIntent(text: string): {
  intent: LiveIntent;
  quantity: number;
} {
  const value = normalizeText(text)
    .replace(/[¿?¡!.,]/g, '')
    .trim();
  if (
    /\b(cancelar|cancela|cancelo|ya no quiero|no quiero|no compro)\b/.test(
      value,
    )
  )
    return { intent: 'CANCEL', quantity: 0 };
  if (
    /\b(quiero|compro|comprar|separa|separas|reservar|reserva|dame|llevo)\b/.test(
      value,
    )
  ) {
    const quantity = /\b(\d+)\b/.exec(value)?.[1];
    const words: Record<string, number> = {
      uno: 1,
      una: 1,
      dos: 2,
      tres: 3,
      cuatro: 4,
      cinco: 5,
    };
    const word = value.split(' ').find((part) => part in words);
    return {
      intent: quantity || word ? 'BUY_QUANTITY' : 'BUY',
      quantity: quantity ? Number(quantity) : word ? words[word] : 1,
    };
  }
  const rules: Array<[RegExp, LiveIntent]> = [
    [/\b(precio|cuanto cuesta|cuanto vale)\b/, 'PRICE'],
    [/\b(stock|disponible|disponibles|quedan|hay unidades)\b/, 'STOCK'],
    [/\b(envio|entrega|delivery|recoger)\b/, 'SHIPPING'],
    [/\b(pago|pagar|tarjeta|yape)\b/, 'PAYMENT'],
    [/\b(detalles|informacion|ingredientes|caracteristicas)\b/, 'PRODUCT_INFO'],
  ];
  return {
    intent: rules.find(([rule]) => rule.test(value))?.[1] ?? 'UNKNOWN',
    quantity: 0,
  };
}
