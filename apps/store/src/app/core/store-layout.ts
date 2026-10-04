import type { StoreTemplate, StoreTemplateContent } from '@vendedoria/contracts';

export type HomeSection = { id: string; type: string };

/** Library blocks every template renders (declared in the API `TEMPLATE_SECTIONS`). */
export const HOME_BLOCKS: readonly string[] = [
  'imageText',
  'text',
  'benefits',
  'testimonials',
  'whatsapp',
  'gallery',
  'cta',
  'questions',
];

const SLOTS = [1, 2, 3] as const;

export type HomeBlockTone = '' | 'soft' | 'brand';

export type HomeBlock = {
  eyebrow: string;
  title: string;
  text: string;
  cta: string;
  image: string;
  /** Background chosen in the editor; '' is the plain template look. */
  tone: HomeBlockTone;
  /** Side of the image in an image-and-text block; '' is the template default. */
  layout: '' | 'start' | 'end';
  /** Benefits with a title or detail, in order. */
  items: { n: number; title: string; text: string }[];
  /** Testimonials with a quote, in order. */
  quotes: { n: number; quote: string; author: string }[];
  /** Gallery slots: `url` is '' for an empty slot. */
  images: { n: number; url: string }[];
};

/**
 * Visible home sections in the merchant order, or the template order when there is none. Items the
 * template does not know are skipped, so content pushed live by the editor can never break the page.
 */
export function homeSections(
  content: StoreTemplateContent,
  template: StoreTemplate,
  builtins: readonly string[],
): HomeSection[] {
  const saved = content.layouts?.[template];
  const items = saved?.length ? saved : builtins.map((id) => ({ id, type: id, hidden: false }));
  const seen = new Set<string>();
  const sections: HomeSection[] = [];
  for (const { id, type, hidden } of items) {
    const known = builtins.includes(type) ? id === type : HOME_BLOCKS.includes(type);
    if (hidden || !known || seen.has(id)) continue;
    seen.add(id);
    sections.push({ id, type });
  }
  return sections;
}

/** Texts of a library block; '' when the merchant left a field empty. */
export function homeBlock(content: StoreTemplateContent, id: string): HomeBlock {
  const fields = content.sections[id] ?? {};
  const get = (key: string) => fields[key] ?? '';
  const tone = get('tone');
  const layout = get('layout');
  return {
    eyebrow: get('eyebrow'),
    title: get('title'),
    text: get('text'),
    cta: get('cta'),
    image: get('image'),
    tone: tone === 'soft' || tone === 'brand' ? tone : '',
    layout: layout === 'start' || layout === 'end' ? layout : '',
    items: SLOTS.map((n) => ({ n, title: get(`item${n}Title`), text: get(`item${n}Text`) })).filter(
      (item) => item.title || item.text,
    ),
    quotes: SLOTS.map((n) => ({ n, quote: get(`quote${n}`), author: get(`author${n}`) })).filter((q) => q.quote),
    images: SLOTS.map((n) => ({ n, url: get(`image${n}`) })),
  };
}
