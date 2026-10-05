import { normalizeText } from './conversation-context';
import { CatalogProductView, moneyLabel } from './sales-agent-tools.service';
import { SalesState } from './sales-state';

const QUESTION_KEYS: Record<string, RegExp> = {
  size: /\b(talla|tamano|medida)\b/,
  color: /\bcolor\b/,
  budget: /\b(presupuesto|cuanto.+gastar|maximo.+pagar)\b/,
  name: /\b(nombre|llamas)\b/,
  quantity: /\b(cuantas? (unidades|quieres)|cantidad)\b/,
  destination: /\b(distrito|provincia|ciudad)\b/,
  address: /\b(direccion)\b/,
};

/** Reject critical ungrounded text. Fallback is built from the same authoritative tool results. */
export function validateSalesResponse(
  text: string,
  names: string[],
  products: CatalogProductView[],
  state?: SalesState,
  policyAnswers: string[] = [],
): string[] {
  const failures = new Set<string>();
  const mentioned = names.map((name) => products.find((p) => p.name === name));
  if (mentioned.some((p) => !p)) failures.add('unknown_product');
  const selected = mentioned.filter((p): p is CatalogProductView => Boolean(p));
  // Numbers must be present in current authoritative prices, with the same currency.
  const amounts =
    text.match(/(?:S\s*\/\.?|PEN|USD|\$|€)\s*\d+(?:[.,]\d{1,2})?/gi) ?? [];
  const canonical = (amount: string) =>
    normalizeText(amount).replace(/[\s.]/g, '').replace(',', '');
  const allowed = new Set(
    selected
      .flatMap((p) => [
        moneyLabel(p.currency, p.basePriceCents),
        p.priceLabel,
        p.compareAtPriceLabel ?? '',
        ...p.variants.map((v) => v.priceLabel),
      ])
      .filter(Boolean)
      .map(canonical),
  );
  for (const amount of amounts)
    if (!allowed.has(canonical(amount))) failures.add('unsupported_price');
  for (const line of text.split(/\n|(?<=[.!?])\s+/)) {
    const named = selected.filter((p) =>
      normalizeText(line).includes(normalizeText(p.name)),
    );
    const lineAmounts =
      line.match(/(?:S\s*\/\.?|PEN|USD|\$|€)\s*\d+(?:[.,]\d{1,2})?/gi) ?? [];
    if (
      named.length === 1 &&
      lineAmounts.some(
        (amount) =>
          ![
            named[0].priceLabel,
            named[0].compareAtPriceLabel,
            ...named[0].variants.map((v) => v.priceLabel),
          ]
            .filter((v): v is string => Boolean(v))
            .map(canonical)
            .includes(canonical(amount)),
      )
    )
      failures.add('price_product_mismatch');
  }
  if (
    selected.length &&
    !selected.some((p) =>
      normalizeText(text).includes(normalizeText(p.name)),
    ) &&
    /\b(recomiendo|encontre|tenemos este|este modelo se llama)\b/.test(
      normalizeText(text),
    )
  )
    failures.add('ambiguous_product_reference');
  if (/\b\d+(?:[.,]\d+)?\s*(?:soles|dolares|euros)\b/i.test(text))
    failures.add('unstructured_price');
  if (
    /\b(?:envio|entrega)\b.{0,50}(?:gratis|gratuit|\d+\s*(?:dias?|horas?))/i.test(
      normalizeText(text),
    )
  )
    failures.add('unsupported_shipping');
  if (
    /\b(?:descuento|garantia|devoluc|cambios|reembolso)\w*/i.test(
      normalizeText(text),
    )
  ) {
    const sentences = text
      .split(/(?<=[.!?])\s+|\n/)
      .filter((s) =>
        /\b(?:descuento|garantia|devoluc|cambios|reembolso)\w*/i.test(
          normalizeText(s),
        ),
      );
    const facts = [
      ...policyAnswers,
      ...selected.flatMap((p) => Object.values(p.facts ?? {}).flat()),
    ].map(normalizeText);
    if (
      sentences.some(
        (s) => !facts.some((fact) => fact.includes(normalizeText(s))),
      )
    )
      failures.add('unsupported_policy');
  }
  const positiveInventory = text
    .split(/\n|(?<=[.!?])\s+/)
    .some(
      (sentence) =>
        /\b(?:hay stock|tenemos stock|esta disponible|estan disponibles|disponible|disponibles|en stock)\b/i.test(
          normalizeText(sentence),
        ) && !/\b(?:no|sin|agotad[oa])\b/.test(normalizeText(sentence)),
    );
  if (positiveInventory) {
    if (!selected.length || selected.some((p) => !p.isAvailable))
      failures.add('unsupported_inventory');
    if (/\btalla\b/.test(normalizeText(text))) {
      const size = normalizeText(text).match(
        /\btalla\s+(\d+|xxs|xs|s|m|l|xl|xxl)\b/,
      )?.[1];
      if (
        !size ||
        selected.some(
          (p) =>
            !p.variants.some(
              (v) =>
                v.isAvailable &&
                normalizeText(v.label)
                  .split(/\s*\/\s*/)
                  .includes(size),
            ),
        )
      )
        failures.add('unsupported_variant');
    }
  }
  for (const match of text.matchAll(
    /\b(\d+)\s+(?:unidades?\s+(?:disponibles?|en stock)|en stock)\b/gi,
  )) {
    const qty = Number(match[1]);
    if (!selected.some((p) => !p.stockUnlimited && p.stockQty === qty))
      failures.add('unsupported_inventory_quantity');
  }
  if (state)
    for (const sentence of text.match(/¿[^?]*\?|[^.!?\n]*\?/g) ?? []) {
      for (const [key, regex] of Object.entries(QUESTION_KEYS))
        if (
          state.answeredQuestions[key] &&
          regex.test(normalizeText(sentence)) &&
          !/\b(confirm|cambias|cambiar|sigue|correcto)\w*/.test(
            normalizeText(sentence),
          )
        )
          failures.add('repeated_question');
    }
  if (/\b(?:ya reserv)\w*/.test(normalizeText(text)))
    failures.add('unsupported_action');
  if (
    /\b(?:ya cree|pedido creado)\w*/.test(normalizeText(text)) &&
    !state?.orderId
  )
    failures.add('unsupported_action');
  if (
    /\b(?:pagado|pago confirmado)\w*/.test(normalizeText(text)) &&
    !['PAID', 'FULFILLING', 'SHIPPED', 'COMPLETED'].includes(
      state?.paymentStatus ?? '',
    )
  )
    failures.add('unsupported_payment');
  return [...failures];
}
