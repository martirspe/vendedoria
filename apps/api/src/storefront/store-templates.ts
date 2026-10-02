import type { Prisma } from '@prisma/client';
import type { StoreTemplate, StoreTemplateCopy } from '@vendedoria/contracts';

export const INDUSTRIES = [
  'general',
  'belleza',
  'moda',
  'hogar',
  'alimentos',
  'tecnologia',
  'salud',
  'mascotas',
  'otros',
] as const;

export type Industry = (typeof INDUSTRIES)[number];

/** Templates each industry can use. `classic` works for every business. */
export const TEMPLATES: Record<StoreTemplate, { industries: readonly Industry[] | 'all' }> = {
  classic: { industries: 'all' },
  selecta: { industries: ['belleza'] },
};

export function templateAllowed(template: string, industry: string): template is StoreTemplate {
  const rule = TEMPLATES[template as StoreTemplate];
  return Boolean(rule) && (rule.industries === 'all' || rule.industries.includes(industry as Industry));
}

/** A template that stopped matching the industry falls back to classic. */
export function effectiveTemplate(template: string, industry: string): StoreTemplate {
  return templateAllowed(template, industry) ? template : 'classic';
}

const COPY_TEXT_FIELDS = [
  'heroEyebrow',
  'heroTitle',
  'heroEmphasis',
  'heroText',
  'heroNote',
  'bannerEyebrow',
  'bannerTitle',
  'bannerText',
  'bannerImageUrl',
  'closingPhrase',
  'footerNote',
] as const;

export const MAX_TEMPLATE_FAQ = 12;

/** Reads stored copy defensively; empty strings mean "use the template default". */
export function readTemplateCopy(value: Prisma.JsonValue | null | undefined): StoreTemplateCopy {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const copy: StoreTemplateCopy = {};
  for (const field of COPY_TEXT_FIELDS) {
    const text = raw[field];
    if (typeof text === 'string' && text.trim()) copy[field] = text.trim().slice(0, 600);
  }
  if (copy.bannerImageUrl && !/^https?:\/\//.test(copy.bannerImageUrl)) delete copy.bannerImageUrl;
  if (Array.isArray(raw['faq'])) {
    const faq = raw['faq'].flatMap((item) => {
      const row = item as Record<string, unknown> | null;
      const question = typeof row?.['question'] === 'string' ? row['question'].trim() : '';
      const answer = typeof row?.['answer'] === 'string' ? row['answer'].trim() : '';
      return question && answer ? [{ question: question.slice(0, 200), answer: answer.slice(0, 1200) }] : [];
    });
    if (faq.length) copy.faq = faq.slice(0, MAX_TEMPLATE_FAQ);
  }
  return copy;
}
