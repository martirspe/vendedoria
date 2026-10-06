import { getTheme, latestThemes, RENDERER_SECTIONS } from '@vendedoria/themes';
import type { Prisma } from '@prisma/client';
import type {
  StoreEditorField,
  StoreEditorSection,
  StoreLayoutItem,
  StoreTemplate,
  StoreTemplateContent,
  StoreTemplateFaq,
  StoreTemplateTheme,
  StoreThemeCorners,
  StoreThemeFont,
  StoreThemeOption,
} from '@vendedoria/contracts';

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

/** Catalog and controls share the platform renderer contract. */
export const TEMPLATES = Object.fromEntries(latestThemes().map(theme => [theme.slug, { industries: theme.industries }]));
export const TEMPLATE_SECTIONS: Record<StoreTemplate, StoreEditorSection[]> = Object.fromEntries(
  latestThemes().map(theme => [theme.slug, sectionsFor(theme.slug, theme.version)]),
);
export function sectionsFor(slug: string, version?: string): StoreEditorSection[] {
  const theme = getTheme(slug, version);
  if (!theme) return [];
  const order = new Map(theme.presets[0].layout.map((item, index) => [item.type, index]));
  return RENDERER_SECTIONS[theme.renderer.split('@')[0]].filter(section => theme.sections.includes(section.id))
    .sort((a, b) => (order.get(a.id) ?? 100) - (order.get(b.id) ?? 100));
}
export function templateAllowed(template: string, industry: string): template is StoreTemplate {
  const theme = getTheme(template);
  return Boolean(theme && (theme.industries === 'all' || theme.industries.includes(industry)));
}
export function effectiveTemplate(template: string, industry: string): StoreTemplate {
  return templateAllowed(template, industry) ? template : 'classic';
}
export const MAX_TEMPLATE_FAQ = 12;
export const MAX_LAYOUT_BLOCKS = 8;
const MAX_LAYOUT_ITEMS = 40;
const MAX_IMAGE_URL = 500;
export function isTextField(field: StoreEditorField): boolean {
  return field.kind === 'text' || field.kind === 'multiline';
}

/**
 * Fields of every section type across templates. Content is validated against all of them so
 * switching templates keeps the texts written for the other one.
 */
const TYPE_FIELDS: Map<string, StoreEditorField[]> = (() => {
  const known = new Map<string, Map<string, StoreEditorField>>();
  for (const sections of Object.values(RENDERER_SECTIONS)) {
    for (const section of sections) {
      const fields = known.get(section.id) ?? new Map<string, StoreEditorField>();
      known.set(section.id, fields);
      for (const field of section.fields) {
        const current = fields.get(field.id);
        // The same key may be one line in a template and several in another: keep the widest rule.
        fields.set(
          field.id,
          current
            ? {
                ...current,
                kind: current.kind === 'multiline' ? current.kind : field.kind,
                maxLength: Math.max(current.maxLength, field.maxLength),
              }
            : field,
        );
      }
    }
  }
  return new Map([...known].map(([type, fields]) => [type, [...fields.values()]]));
})();

const BLOCK_TYPES = new Set(Object.values(RENDERER_SECTIONS).flat().filter(section => section.role === 'block').map(section => section.id));
const BLOCK_ID = /^([a-zA-Z]+)-([a-z0-9]{6})$/;

/** Section type of a content key: built-in ids are their type, blocks are `type-xxxxxx`. */
export function sectionType(id: string): string | null {
  if (TYPE_FIELDS.has(id) && !BLOCK_TYPES.has(id)) return id;
  const match = BLOCK_ID.exec(id);
  return match && BLOCK_TYPES.has(match[1]) ? match[1] : null;
}

export function defaultLayout(template: StoreTemplate): StoreLayoutItem[] {
  return getTheme(template)!.presets[0].layout.map(item => ({ ...item }));
}

/**
 * Valid home order for a template: every built-in section once (missing ones are appended),
 * library blocks of that template up to the limit, and `hidden` only where the section allows it.
 */
export function normalizeLayout(template: StoreTemplate, items: unknown[]): StoreLayoutItem[] {
  const schema = TEMPLATE_SECTIONS[template];
  const seen = new Set<string>();
  const layout: StoreLayoutItem[] = [];
  let blocks = 0;
  for (const entry of items.slice(0, MAX_LAYOUT_ITEMS)) {
    const item = asRecord(entry);
    const { id, type } = item;
    if (typeof id !== 'string' || typeof type !== 'string' || seen.has(id)) continue;
    const section = schema.find((s) => s.id === type);
    if (!section || section.role === 'fixed') continue;
    if (section.role === 'builtin' ? id !== type : sectionType(id) !== type || blocks >= MAX_LAYOUT_BLOCKS) continue;
    if (section.role === 'block') blocks++;
    seen.add(id);
    layout.push(item['hidden'] === true && section.canHide ? { id, type, hidden: true } : { id, type });
  }
  for (const item of defaultLayout(template)) {
    if (!seen.has(item.id)) layout.push(item);
  }
  return layout;
}

function readLayouts(value: unknown): StoreTemplateContent['layouts'] {
  const raw = asRecord(value);
  const layouts: NonNullable<StoreTemplateContent['layouts']> = {};
  for (const template of Object.keys(TEMPLATES) as StoreTemplate[]) {
    const items = raw[template];
    if (!Array.isArray(items)) continue;
    const layout = normalizeLayout(template, items);
    // An explicitly selected composition belongs to the merchant, even if it equals defaults.
    if (items.some(entry => {
      const item = asRecord(entry);
      return typeof item['type'] === 'string' && TEMPLATE_SECTIONS[template].some(section => section.id === item['type'] && section.role !== 'fixed');
    })) layouts[template] = layout;
  }
  return Object.keys(layouts).length ? layouts : undefined;
}

// Control characters except tab and newline.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

export function cleanText(value: string, field: StoreEditorField): string {
  const normalized = value.replace(/\r\n?/g, '\n').replace(CONTROL, '').replace(/\t/g, ' ');
  if (field.kind === 'text') return normalized.replace(/\s+/g, ' ').trim().slice(0, field.maxLength);
  return normalized
    .split('\n')
    .map((line) => line.replace(/ {2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, field.maxLength);
}

export const EMPTY_CONTENT: StoreTemplateContent = { version: 1, sections: {} };

export const THEME_FONTS: readonly StoreThemeFont[] = ['modern', 'editorial', 'simple'];
export const THEME_CORNERS: readonly StoreThemeCorners[] = ['square', 'soft', 'round'];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Style options each template renders; the editor only offers these. */
export const TEMPLATE_THEME_OPTIONS: Record<StoreTemplate, StoreThemeOption[]> = Object.fromEntries(
  latestThemes().map(theme => [theme.slug, theme.settings]),
);

/**
 * Values a template uses when the merchant sets none: Classic follows the store settings,
 * Selecta keeps its own palette and monogram.
 */
export function themeDefaults(
  template: StoreTemplate,
  storefront: { brandColor: string; accentColor: string; logoUrl: string | null },
  version?: string,
): Required<StoreTemplateTheme> {
  return {
    primary: storefront.brandColor, accent: storefront.accentColor, font: 'modern', corners: 'soft',
    logo: storefront.logoUrl ?? '', favicon: '', background: '#ffffff', surface: '#f6f7f9',
    text: '#111318', muted: '#5b6472', border: '#e4e7ec', container: 'standard', spacing: 'standard', typeScale: 'standard',
    ...(getTheme(template, version)?.renderer === 'selecta@1' ? { logo: '', background: '#fffaf6', surface: '#ffffff', text: '#301824', muted: '#77676c', border: '#e4d8d5' } : {}),
    ...getTheme(template, version)?.tokens,
  };
}

function readTheme(value: unknown, allowImage: (url: string) => boolean): StoreTemplateTheme | undefined {
  const raw = asRecord(value);
  const theme: StoreTemplateTheme = {};
  for (const key of ['primary', 'accent', 'background', 'surface', 'text', 'muted', 'border'] as const) {
    const color = raw[key];
    if (typeof color === 'string' && HEX_COLOR.test(color)) theme[key] = color.toLowerCase();
  }
  if (THEME_FONTS.includes(raw['font'] as StoreThemeFont)) theme.font = raw['font'] as StoreThemeFont;
  if (THEME_CORNERS.includes(raw['corners'] as StoreThemeCorners)) theme.corners = raw['corners'] as StoreThemeCorners;
  for (const key of ['logo', 'favicon'] as const) {
    const url = typeof raw[key] === 'string' ? raw[key].trim() : null;
    if (url === '' || (url && url.length <= MAX_IMAGE_URL && isHttpUrl(url) && allowImage(url))) theme[key] = url;
  }
  for (const key of ['container', 'spacing', 'typeScale'] as const) {
    const allowed = key === 'container' ? ['compact', 'standard', 'wide'] : key === 'spacing' ? ['compact', 'standard', 'airy'] : ['standard', 'large'];
    if (typeof raw[key] === 'string' && allowed.includes(raw[key])) Object.assign(theme, { [key]: raw[key] });
  }
  return Object.keys(theme).length ? theme : undefined;
}

/**
 * Normalizes merchant content: known fields only, plain text within limits, images that pass
 * `allowImage`. Anything else is dropped, so stored content is always safe to render.
 */
export function sanitizeContent(
  value: unknown,
  allowImage: (url: string) => boolean = isHttpUrl,
): StoreTemplateContent {
  const raw = asRecord(value);
  const layouts = readLayouts(raw['layouts']);
  // Texts of removed blocks are dropped; built-in sections keep theirs even when hidden.
  const blockIds = new Set(
    Object.values(layouts ?? {})
      .flatMap(items => items ?? [])
      .filter((item) => BLOCK_TYPES.has(item.type))
      .map((item) => item.id),
  );
  const rawSections = asRecord(raw['sections']);
  const sections: StoreTemplateContent['sections'] = {};
  for (const sectionId of Object.keys(rawSections).sort()) {
    const type = sectionType(sectionId);
    if (!type || (BLOCK_TYPES.has(type) && !blockIds.has(sectionId))) continue;
    const input = asRecord(rawSections[sectionId]);
    for (const field of TYPE_FIELDS.get(type) ?? []) {
      const value = input[field.id];
      if (typeof value !== 'string') continue;
      let clean: string;
      if (field.kind === 'image') {
        clean = value.trim();
        if (clean && (clean.length > MAX_IMAGE_URL || !isHttpUrl(clean) || !allowImage(clean))) continue;
      } else if (field.kind === 'choice') {
        clean = value;
        if (clean && !field.options?.some((option) => option.value === clean)) continue;
      } else if (field.kind === 'url') {
        clean = value.trim();
        if (clean && (!isSocialUrl(clean, field.id) || clean.length > field.maxLength)) continue;
      } else {
        clean = cleanText(value, field);
      }
      (sections[sectionId] ??= {})[field.id] = clean;
    }
  }
  const content: StoreTemplateContent = { version: 1, sections };
  const faq = readFaq(raw['faq']);
  if (faq.length) content.faq = faq;
  if (layouts) content.layouts = layouts;
  const theme = readTheme(raw['theme'], allowImage);
  if (theme) content.theme = theme;
  return content;
}

/** Image URLs of a content, to keep accepting the ones the merchant already had. */
export function contentImages(content: StoreTemplateContent): string[] {
  const images = [content.theme?.logo ?? '', content.theme?.favicon ?? ''];
  for (const [id, fields] of Object.entries(content.sections)) {
    const type = sectionType(id);
    if (!type) continue;
    for (const field of TYPE_FIELDS.get(type) ?? []) if (field.kind === 'image') images.push(fields[field.id] ?? '');
  }
  return images.filter(isHttpUrl);
}

/** Social links are destinations, never fetched or executed by the API. */
function isSocialUrl(value: string, platform: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      ['instagram', 'facebook', 'tiktok'].includes(platform) && [`${platform}.com`, `www.${platform}.com`].includes(url.hostname);
  } catch { return false; }
}

export function sameContent(a: StoreTemplateContent, b: StoreTemplateContent): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Stored content read defensively (rows written before validation changes). */
export function readTemplateContent(value: Prisma.JsonValue | null | undefined): StoreTemplateContent {
  return value ? sanitizeContent(value) : EMPTY_CONTENT;
}

/** Same content with one field set; used by imports that bring a template image. */
export function withContentField(
  content: StoreTemplateContent,
  section: string,
  field: string,
  value: string,
): StoreTemplateContent {
  return {
    ...content,
    sections: { ...content.sections, [section]: { ...content.sections[section], [field]: value } },
  };
}

function readFaq(value: unknown): StoreTemplateFaq[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => {
      const row = asRecord(item);
      const question = typeof row['question'] === 'string' ? row['question'].replace(CONTROL, '').trim() : '';
      const answer = typeof row['answer'] === 'string' ? row['answer'].replace(CONTROL, '').trim() : '';
      return question && answer ? [{ question: question.slice(0, 200), answer: answer.slice(0, 1200) }] : [];
    })
    .slice(0, MAX_TEMPLATE_FAQ);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
