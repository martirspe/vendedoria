export function whatsappUrl(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/** `Ref: P-{handle}` lets the sales agent load the product the buyer is asking about. */
export function productReference(handle: string): string {
  return `Ref: P-${handle}`;
}
