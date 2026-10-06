import type {
  StoreEditorField,
  StoreEditorSection,
  StoreEditorSnapshot,
  StoreLayoutItem,
  StoreTemplate,
  StoreTemplateContent,
  StoreTemplateFaq,
  StoreTemplateTheme,
  StoreThemeCorners,
  StoreThemeFont,
  StoreThemeOption,
} from '@vendedoria/contracts';
import type { StorePageAi } from '../../core/api/store-api.service';

export const MAX_FAQ = 12;
/** Same limit as the API (`MAX_LAYOUT_BLOCKS`). */
export const MAX_BLOCKS = 8;
const BLOCK_ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
/** Built-in product grids of each template (Classic `featured`, Selecta `collection`). */
const PRODUCT_SECTIONS: readonly string[] = ['featured', 'collection'];

/** Schema of a layout item: blocks use ids like `imageText-a1b2c3`. */
export function sectionSchema(sections: StoreEditorSection[], type: string): StoreEditorSection | undefined {
  return sections.find((s) => s.id === type);
}

/** Type of a content section id (`hero` → `hero`, `text-a1b2c3` → `text`). */
export function typeOf(id: string): string {
  const dash = id.indexOf('-');
  return dash === -1 ? id : id.slice(0, dash);
}

/** Home order being edited: the saved one, plus any built-in section it is missing. */
export function layoutOf(
  content: StoreTemplateContent,
  template: StoreTemplate,
  sections: StoreEditorSection[],
  defaults: StoreLayoutItem[] = [],
): StoreLayoutItem[] {
  const seen = new Set<string>();
  const layout: StoreLayoutItem[] = [];
  for (const item of content.layouts?.[template] ?? defaults) {
    const schema = sectionSchema(sections, item.type);
    if (!schema || schema.role === 'fixed' || seen.has(item.id)) continue;
    seen.add(item.id);
    layout.push(item);
  }
  for (const section of sections) {
    if (section.role === 'builtin' && !seen.has(section.id)) layout.push({ id: section.id, type: section.id });
  }
  return layout;
}

export function withLayout(
  content: StoreTemplateContent,
  template: StoreTemplate,
  layout: StoreLayoutItem[],
): StoreTemplateContent {
  return { ...content, layouts: { ...content.layouts, [template]: layout } };
}

/** Moves an item to `index` (clamped). */
export function moveItem(layout: StoreLayoutItem[], id: string, index: number): StoreLayoutItem[] {
  const from = layout.findIndex((item) => item.id === id);
  if (from === -1) return layout;
  const next = layout.filter((item) => item.id !== id);
  next.splice(Math.max(0, Math.min(index, next.length)), 0, layout[from]);
  return next;
}

export function toggleHidden(layout: StoreLayoutItem[], id: string): StoreLayoutItem[] {
  return layout.map((item) => {
    if (item.id !== id) return item;
    const { hidden, ...rest } = item;
    return hidden ? rest : { ...rest, hidden: true };
  });
}

export function newBlockId(type: string, random: () => number = Math.random): string {
  const suffix = Array.from({ length: 6 }, () => BLOCK_ID_CHARS[Math.floor(random() * BLOCK_ID_CHARS.length)]);
  return `${type}-${suffix.join('')}`;
}

/** Adds a library block after `afterId` (or at the end) with its initial texts. */
export function addBlock(
  content: StoreTemplateContent,
  template: StoreTemplate,
  layout: StoreLayoutItem[],
  block: StoreEditorSection,
  id: string,
  afterId: string | null,
): StoreTemplateContent {
  const after = afterId ? layout.findIndex((item) => item.id === afterId) : -1;
  const next = [...layout];
  next.splice(after === -1 ? layout.length : after + 1, 0, { id, type: block.id });
  return {
    ...withLayout(content, template, next),
    sections: { ...content.sections, [id]: { ...block.defaults } },
  };
}

/** Removes a block and its texts. */
export function removeBlock(
  content: StoreTemplateContent,
  template: StoreTemplate,
  layout: StoreLayoutItem[],
  id: string,
): StoreTemplateContent {
  const { [id]: _removed, ...sections } = content.sections;
  return {
    ...withLayout(
      content,
      template,
      layout.filter((item) => item.id !== id),
    ),
    sections,
  };
}
/**
 * Applies a generated page: new texts for the built-in sections, and the generated blocks (when
 * any) in place of the ones the merchant had added, below the product grid (else the cover) so
 * products stay near the top. Visibility of built-in sections and their images stay as they were.
 */
export function applyPage(
  content: StoreTemplateContent,
  template: StoreTemplate,
  schema: StoreEditorSection[],
  page: StorePageAi,
  newId: (type: string) => string = (type) => newBlockId(type),
): StoreTemplateContent {
  const isBlock = (type: string) => sectionSchema(schema, type)?.role === 'block';
  let next = content;
  let layout = layoutOf(content, template, schema);
  const replaced = page.blocks.some((b) => isBlock(b.type)) ? layout.filter((i) => isBlock(i.type)) : [];
  for (const item of replaced) {
    next = removeBlock(next, template, layout, item.id);
    layout = layout.filter((i) => i.id !== item.id);
  }
  const write = (id: string, section: StoreEditorSection, texts: Record<string, string>) => {
    for (const field of section.fields) {
      const text = texts[field.id];
      if (isTextField(field) && typeof text === 'string') next = withField(next, id, field.id, clampValue(field, text));
    }
  };
  for (const [id, texts] of Object.entries(page.sections)) {
    const section = sectionSchema(schema, id);
    if (section?.role === 'builtin') write(id, section, texts);
  }
  let after = (layout.find((i) => PRODUCT_SECTIONS.includes(i.type)) ?? layout.find((i) => i.type === 'hero'))?.id ?? null;
  for (const generated of page.blocks) {
    const block = sectionSchema(schema, generated.type);
    if (block?.role !== 'block') continue;
    const id = newId(block.id);
    next = addBlock(next, template, layout, block, id, after);
    layout = next.layouts?.[template] ?? layout;
    write(id, block, generated.texts);
    after = id;
  }
  return withLayout(next, template, layout);
}

const HISTORY_LIMIT = 60;
/** Keystrokes on the same field closer than this are one undo step. */
const MERGE_WINDOW_MS = 1500;

export function fieldKey(section: string, field: string): string {
  return `${section}.${field}`;
}

/** What the store shows for a field: the merchant value, else the template text it reported. */
export function displayValue(
  content: StoreTemplateContent,
  snapshot: StoreEditorSnapshot | null,
  section: string,
  field: string,
): string {
  return content.sections[section]?.[field] ?? snapshot?.fields[fieldKey(section, field)] ?? '';
}

export function isOverridden(content: StoreTemplateContent, section: string, field: string): boolean {
  return content.sections[section]?.[field] !== undefined;
}

/** Fields written with words (the others are images and design choices). */
export function isTextField(field: StoreEditorField): boolean {
  return field.kind === 'text' || field.kind === 'multiline';
}

/** Image fields that may get an AI ambiance photo; the gallery is for real photos only (API `AI_IMAGE_EXCLUDED_BLOCKS`). */
export function canGenerateImage(section: string, field: StoreEditorField): boolean {
  return field.kind === 'image' && typeOf(section) !== 'gallery';
}

/** Text as the API will store it, so the page never shows more than what gets saved. */
export function clampValue(field: StoreEditorField, value: string): string {
  if (field.kind === 'image') return value.trim();
  const text = field.kind === 'text' ? value.replace(/\s*\n\s*/g, ' ') : value;
  return text.slice(0, field.maxLength);
}

export function withField(
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

/** Back to the template text. */
export function withoutField(content: StoreTemplateContent, section: string, field: string): StoreTemplateContent {
  const { [field]: _removed, ...rest } = content.sections[section] ?? {};
  const sections = { ...content.sections };
  if (Object.keys(rest).length) sections[section] = rest;
  else delete sections[section];
  return { ...content, sections };
}

/** `undefined` returns to the questions built from the store settings. */
export function withFaq(content: StoreTemplateContent, faq: StoreTemplateFaq[] | undefined): StoreTemplateContent {
  const { faq: _previous, ...rest } = content;
  return faq ? { ...rest, faq: faq.slice(0, MAX_FAQ) } : rest;
}

export type ThemeColorOption = 'primary' | 'accent' | 'background' | 'surface' | 'text' | 'muted' | 'border';
export const THEME_COLORS: readonly { id: ThemeColorOption; label: string; hint: string }[] = [
  { id: 'primary', label: 'Color principal', hint: 'Botones, enlaces y detalles destacados.' },
  { id: 'accent', label: 'Color de acento', hint: 'Etiquetas y detalles secundarios.' },
  { id: 'background', label: 'Fondo', hint: 'Fondo general de tu tienda.' },
  { id: 'surface', label: 'Superficies', hint: 'Tarjetas y áreas secundarias.' },
  { id: 'text', label: 'Texto principal', hint: 'Debe contrastar con el fondo.' },
  { id: 'muted', label: 'Texto secundario', hint: 'Información de apoyo, siempre legible.' },
  { id: 'border', label: 'Bordes', hint: 'Separadores y límites de los controles.' },
];

export const THEME_CHOICES = [
  { id: 'container' as const, label: 'Ancho del contenido', options: [{ value: 'compact', label: 'Compacto' }, { value: 'standard', label: 'Estándar' }, { value: 'wide', label: 'Amplio' }] },
  { id: 'spacing' as const, label: 'Espacio entre secciones', options: [{ value: 'compact', label: 'Compacto' }, { value: 'standard', label: 'Estándar' }, { value: 'airy', label: 'Espacioso' }] },
  { id: 'typeScale' as const, label: 'Tamaño de lectura', options: [{ value: 'standard', label: 'Estándar' }, { value: 'large', label: 'Grande' }] },
];

export const THEME_FONTS: readonly { id: StoreThemeFont; label: string; hint: string }[] = [
  { id: 'modern', label: 'Moderna', hint: 'Limpia y actual, para cualquier rubro.' },
  { id: 'editorial', label: 'Editorial', hint: 'Títulos con serifa, elegante.' },
  { id: 'simple', label: 'Sencilla', hint: 'La letra del dispositivo; carga más rápido.' },
];

export const THEME_CORNERS: readonly { id: StoreThemeCorners; label: string }[] = [
  { id: 'square', label: 'Rectas' },
  { id: 'soft', label: 'Suaves' },
  { id: 'round', label: 'Redondas' },
];

/** Sets one style option; `undefined` returns it to the template default. */
export function withTheme<K extends StoreThemeOption>(
  content: StoreTemplateContent,
  key: K,
  value: StoreTemplateTheme[K] | undefined,
): StoreTemplateContent {
  const { [key]: _previous, ...others } = content.theme ?? {};
  const theme: StoreTemplateTheme = value === undefined ? others : { ...others, [key]: value };
  const { theme: _old, ...rest } = content;
  return Object.keys(theme).length ? { ...rest, theme } : rest;
}

/** Undo/redo of whole content states; quick edits of one field merge into a single step. */
export class ContentHistory {
  private past: StoreTemplateContent[] = [];
  private future: StoreTemplateContent[] = [];
  private lastKey: string | null = null;
  private lastAt = 0;

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Call with the state before a change. `key` groups typing on the same field. */
  record(before: StoreTemplateContent, key: string | null, now = Date.now()): void {
    const merge = key !== null && key === this.lastKey && now - this.lastAt < MERGE_WINDOW_MS;
    this.lastKey = key;
    this.lastAt = now;
    this.future = [];
    if (merge) return;
    this.past.push(before);
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
  }

  undo(current: StoreTemplateContent): StoreTemplateContent | null {
    const previous = this.past.pop();
    if (!previous) return null;
    this.future.push(current);
    this.lastKey = null;
    return previous;
  }

  redo(current: StoreTemplateContent): StoreTemplateContent | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(current);
    this.lastKey = null;
    return next;
  }
}
