import type { StoreTemplateFaq, StorefrontView } from '@vendedoria/contracts';
import { defaultFaq } from '../../core/store-faq';

const SELECTA_CART = {
  online:
    'No. Comprar ahora agrega el producto a Mi bolsa y abre el pago con todos tus favoritos. Completas tus datos, la entrega y el pago en una sola página, como invitado.',
  whatsapp:
    'No. Reúne tus favoritos en Mi bolsa y envíanos el pedido por WhatsApp. Te confirmamos el stock, la entrega y el pago antes de preparar tu pedido.',
};

/** Texts of the template; '' hides that text. Multiline values keep their line breaks. */
export type SelectaCopy = {
  heroEyebrow: string;
  heroTitle: string;
  heroEmphasis: string;
  heroText: string;
  heroCta: string;
  heroNote: string;
  heroPhotoNote: string;
  /** Undefined uses the store cover or a product photo; '' shows none. */
  heroImage: string | undefined;
  collectionEyebrow: string;
  collectionTitle: string;
  collectionText: string;
  bannerEyebrow: string;
  bannerTitle: string;
  bannerEmphasis: string;
  bannerText: string;
  bannerImage: string | undefined;
  faqEyebrow: string;
  faqTitle: string;
  faqEmphasis: string;
  faq: StoreTemplateFaq[];
  closing: string;
  footerNote: string;
};

/** Merchant texts over the original template texts. */
export function selectaCopy(store: StorefrontView): SelectaCopy {
  const content = store.templateContent;
  const text = (section: string, field: string, fallback: string) => content.sections[section]?.[field] ?? fallback;
  return {
    heroEyebrow: text('hero', 'eyebrow', 'TU PRÓXIMO FAVORITO'),
    heroTitle: text('hero', 'title', 'Hay un ritual\nque lleva'),
    heroEmphasis: text('hero', 'emphasis', 'tu esencia.'),
    heroText: text(
      'hero',
      'text',
      'Fragancias que dejan huella y cuidado que se siente. Descubre nuestra selección de perfumes y cuidado personal.',
    ),
    heroCta: text('hero', 'cta', 'Explorar catálogo'),
    heroNote: text('hero', 'note', 'Pequeños detalles. Grandes momentos.'),
    heroPhotoNote: text('hero', 'photoNote', 'EL ARTE DE CUIDARTE'),
    heroImage: content.sections['hero']?.['image'],
    collectionEyebrow: text('collection', 'eyebrow', 'ELEGIDOS PARA TI'),
    collectionTitle: text('collection', 'title', 'Tu esencia, tu elección.'),
    collectionText: text('collection', 'text', 'Sets para regalar.\nFavoritos para quedarte.'),
    bannerEyebrow: text('banner', 'eyebrow', 'UN REGALO CON INTENCIÓN'),
    bannerTitle: text('banner', 'title', 'Para alguien especial.'),
    bannerEmphasis: text('banner', 'emphasis', 'También puedes ser tú.'),
    bannerText: text('banner', 'text', 'Elige un set y descubre cada pieza, su aroma y su modo de uso.'),
    bannerImage: content.sections['banner']?.['image'],
    faqEyebrow: text('faq', 'eyebrow', 'COMPRA CON CLARIDAD'),
    faqTitle: text('faq', 'title', 'Antes de elegir,'),
    faqEmphasis: text('faq', 'emphasis', 'todo claro.'),
    faq: content.faq?.length ? content.faq : defaultFaq(store, SELECTA_CART),
    closing: text('footer', 'closing', 'Una selección para tus momentos favoritos.'),
    footerNote: text('footer', 'note', ''),
  };
}
