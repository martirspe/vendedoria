type Selection = { handle: string; variantId?: string | null; quantity: number };

/** Scope idempotency to store, purchase intent and selection, including quantities. */
export function checkoutStorageKey(slug: string, intent: string, items: Selection[]): string {
  const selection = items.map((item) => [item.handle, item.variantId ?? '', item.quantity])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return `vendedoria-checkout-v2:${slug}:${intent}:${JSON.stringify(selection)}`;
}

export function subtractPurchased<T extends { key: string; quantity: number }>(lines: T[], purchased: { key: string; quantity: number }[]): T[] {
  const quantities = new Map(purchased.map((line) => [line.key, line.quantity]));
  return lines.flatMap((line) => {
    const quantity = Math.max(0, line.quantity - (quantities.get(line.key) ?? 0));
    return quantity ? [{ ...line, quantity }] : [];
  });
}
