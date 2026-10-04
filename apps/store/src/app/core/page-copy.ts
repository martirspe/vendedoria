import type { StoreTemplateContent } from '@vendedoria/contracts';

/** Merchant texts of the product page (`product` section); '' hides that text. */
export type ProductCopy = { whatsapp: string; note: string };

export function productCopy(content: StoreTemplateContent | undefined): ProductCopy {
  const section = content?.sections['product'];
  return { whatsapp: section?.['whatsapp'] ?? 'Consultar por WhatsApp', note: section?.['note'] ?? '' };
}

/** Merchant announcement bar text; undefined when the merchant never set one. */
export function announcementText(content: StoreTemplateContent): string | undefined {
  return content.sections['announcement']?.['text'];
}
