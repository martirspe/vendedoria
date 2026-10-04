import type { Prisma } from '@prisma/client';
import type {
  StoreEditorChoice,
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

/** Templates each industry can use. `classic` works for every business. */
export const TEMPLATES: Record<StoreTemplate, { industries: readonly Industry[] | 'all' }> = {
  classic: { industries: 'all' },
  selecta: { industries: ['belleza'] },
  stride: { industries: ['moda'] },
};

export function templateAllowed(template: string, industry: string): template is StoreTemplate {
  const rule = TEMPLATES[template as StoreTemplate];
  return Boolean(rule) && (rule.industries === 'all' || rule.industries.includes(industry as Industry));
}

/** A template that stopped matching the industry falls back to classic. */
export function effectiveTemplate(template: string, industry: string): StoreTemplate {
  return templateAllowed(template, industry) ? template : 'classic';
}

export const MAX_TEMPLATE_FAQ = 12;
const MAX_IMAGE_URL = 500;

const text = (id: string, label: string, maxLength: number): StoreEditorField => ({ id, label, kind: 'text', maxLength });
const lines = (id: string, label: string, maxLength: number): StoreEditorField => ({
  id,
  label,
  kind: 'multiline',
  maxLength,
});
const image = (id: string, label: string): StoreEditorField => ({ id, label, kind: 'image', maxLength: 0 });
const choice = (id: string, label: string, options: StoreEditorChoice[]): StoreEditorField => ({
  id,
  label,
  kind: 'choice',
  maxLength: 0,
  options,
});
/** Background of a block, rendered with the theme colors of each template. */
const tone = choice('tone', 'Fondo', [
  { value: '', label: 'Sin fondo' },
  { value: 'soft', label: 'Suave' },
  { value: 'brand', label: 'Color de tu marca' },
]);

/** Fields the merchant (or the writing assistant) fills with words. */
export function isTextField(field: StoreEditorField): boolean {
  return field.kind === 'text' || field.kind === 'multiline';
}

export const MAX_LAYOUT_BLOCKS = 8;
const MAX_LAYOUT_ITEMS = 40;

/** Library blocks; every template renders them in its own style. */
const BLOCKS: StoreEditorSection[] = [
  {
    id: 'imageText',
    label: 'Imagen con texto',
    role: 'block',
    canHide: true,
    faq: false,
    description: 'Una foto junto a un título y un texto: novedades, promociones o la historia de tu marca.',
    fields: [
      text('eyebrow', 'Antetítulo', 60),
      lines('title', 'Título', 100),
      lines('text', 'Texto', 400),
      text('cta', 'Botón hacia tus productos', 30),
      image('image', 'Imagen'),
      choice('layout', 'Posición de la imagen', [
        { value: 'start', label: 'Izquierda' },
        { value: 'end', label: 'Derecha' },
      ]),
    ],
    defaults: {
      eyebrow: 'Novedad',
      title: 'Descubre tu próximo favorito',
      text: 'Explora el catálogo y encuentra una opción para ti.',
      cta: 'Ver productos',
      image: '',
    },
  },
  {
    id: 'text',
    label: 'Texto destacado',
    role: 'block',
    canHide: true,
    faq: false,
    description: 'Un mensaje breve y centrado: tu propuesta, una garantía o un aviso importante.',
    fields: [text('eyebrow', 'Antetítulo', 60), lines('title', 'Título', 120), lines('text', 'Texto', 600), tone],
    defaults: {
      eyebrow: 'Sobre nosotros',
      title: 'Elige con toda la información',
      text: 'Revisa los detalles de cada producto y consulta nuestras políticas antes de comprar.',
    },
  },
  {
    id: 'benefits',
    label: 'Beneficios',
    role: 'block',
    canHide: true,
    faq: false,
    description: 'Tres razones para comprarte: atención, calidad, entrega o lo que te distinga.',
    fields: [
      text('eyebrow', 'Antetítulo', 60),
      lines('title', 'Título', 100),
      ...[1, 2, 3].flatMap((n) => [text(`item${n}Title`, `Beneficio ${n}`, 50), lines(`item${n}Text`, `Detalle ${n}`, 160)]),
      tone,
    ],
    defaults: {
      eyebrow: 'Por qué elegirnos',
      title: 'Comprar aquí es fácil',
      item1Title: 'Información a la mano',
      item1Text: 'Revisa las características y el precio antes de elegir.',
      item2Title: 'Productos elegidos',
      item2Text: 'Explora el catálogo y compara las opciones disponibles.',
      item3Title: 'Compra sin cuenta',
      item3Text: 'Haz tu pedido sin crear una cuenta.',
    },
  },
  {
    id: 'testimonials',
    label: 'Opiniones de clientes',
    role: 'block',
    canHide: true,
    faq: false,
    description: 'Hasta tres comentarios reales de tus clientes con su nombre.',
    fields: [
      text('eyebrow', 'Antetítulo', 60),
      lines('title', 'Título', 100),
      ...[1, 2, 3].flatMap((n) => [lines(`quote${n}`, `Opinión ${n}`, 300), text(`author${n}`, `Cliente ${n}`, 60)]),
      tone,
    ],
    defaults: {
      eyebrow: 'Lo que dicen',
      title: 'Opiniones de nuestros clientes',
      quote1: '',
      author1: '',
      quote2: '',
      author2: '',
      quote3: '',
      author3: '',
    },
  },
  {
    id: 'whatsapp',
    label: 'Botón de WhatsApp',
    role: 'block',
    canHide: true,
    faq: false,
    description: 'Una invitación a escribirte; abre tu WhatsApp de ventas configurado en Tienda web.',
    fields: [lines('title', 'Título', 100), lines('text', 'Texto', 240), text('cta', 'Botón', 30)],
    defaults: {
      title: '¿Tienes dudas? Te ayudamos a elegir',
      text: 'Escríbenos y te respondemos con gusto.',
      cta: 'Escríbenos por WhatsApp',
    },
  },
  {
    id: 'gallery',
    label: 'Galería de fotos',
    role: 'block',
    canHide: true,
    faq: false,
    description: 'Hasta tres fotos de tus productos, tu local o tu equipo.',
    fields: [text('eyebrow', 'Antetítulo', 60), lines('title', 'Título', 100), ...[1, 2, 3].map((n) => image(`image${n}`, `Foto ${n}`))],
    defaults: { eyebrow: 'Conócenos', title: 'Así trabajamos', image1: '', image2: '', image3: '' },
  },
  {
    id: 'cta',
    label: 'Llamado a la acción',
    role: 'block',
    canHide: true,
    faq: false,
    description: 'Una franja con un mensaje y un botón hacia tus productos: lanzamientos, temporadas o colecciones.',
    fields: [
      text('eyebrow', 'Antetítulo', 60),
      lines('title', 'Título', 100),
      lines('text', 'Texto', 240),
      text('cta', 'Botón hacia tus productos', 30),
      tone,
    ],
    defaults: {
      eyebrow: '',
      title: 'Encuentra tu próximo favorito',
      text: 'Explora el catálogo y elige lo que va contigo.',
      cta: 'Ver productos',
      tone: 'brand',
    },
  },
  {
    id: 'questions',
    label: 'Preguntas frecuentes',
    role: 'block',
    canHide: true,
    faq: true,
    description: 'Respuestas sobre pagos, envíos y cambios armadas con tu configuración; puedes personalizarlas.',
    fields: [text('eyebrow', 'Antetítulo', 60), lines('title', 'Título', 100), tone],
    defaults: { eyebrow: 'Compra con confianza', title: 'Preguntas frecuentes' },
  },
];

/**
 * Library of a template: Selecta already has its own FAQ section and shows the image of an
 * image-and-text block on the right.
 */
function libraryOf(template: StoreTemplate): StoreEditorSection[] {
  return BLOCKS.filter((block) => template === 'classic' || block.id !== 'questions').map((block) =>
    block.id === 'imageText'
      ? { ...block, defaults: { ...block.defaults, layout: template === 'selecta' ? 'end' : 'start' } }
      : block,
  );
}

/** Fixed sections every template renders outside the home body. */
const ANNOUNCEMENT: StoreEditorSection = {
  id: 'announcement',
  label: 'Anuncio superior',
  role: 'fixed',
  canHide: false,
  faq: false,
  description: 'Franja arriba de todas las páginas: envíos, promociones o avisos. Déjala vacía para ocultarla.',
  fields: [text('text', 'Texto del anuncio', 120)],
};
const PRODUCT_PAGE: StoreEditorSection = {
  id: 'product',
  label: 'Página de producto',
  role: 'fixed',
  canHide: false,
  faq: false,
  page: 'product',
  description: 'Textos de la página de cada producto. La vista previa abre uno de tus productos.',
  fields: [text('whatsapp', 'Botón de WhatsApp', 30), lines('note', 'Mensaje junto al botón de compra', 240)],
};

/**
 * What the merchant can edit on each template, home sections in default page order; the store
 * renders the same `section.field` keys and the same section types.
 */
export const TEMPLATE_SECTIONS: Record<StoreTemplate, StoreEditorSection[]> = {
  stride: [
    {
      id: 'hero',
      label: 'Portada',
      role: 'builtin',
      canHide: true,
      faq: false,
      fields: [
        text('eyebrow', 'Antetítulo', 60),
        lines('title', 'Título', 80),
        text('emphasis', 'Frase destacada', 80),
        lines('text', 'Texto', 300),
        text('cta', 'Botón al catálogo', 30),
        image('image', 'Imagen de portada'),
      ],
    },
    {
      id: 'featured',
      label: 'Selección de productos',
      role: 'builtin',
      canHide: false,
      faq: false,
      fields: [text('eyebrow', 'Antetítulo', 60), text('title', 'Título', 80)],
    },
    {
      id: 'editorial',
      label: 'Inspiración para vestir',
      role: 'builtin',
      canHide: true,
      faq: false,
      fields: [1, 2].flatMap((n) => [
        text(`eyebrow${n}`, `Antetítulo ${n}`, 60),
        lines(`title${n}`, `Título ${n}`, 80),
        lines(`text${n}`, `Texto ${n}`, 240),
        text(`cta${n}`, `Botón ${n}`, 30),
        image(`image${n}`, `Imagen ${n}`),
      ]),
    },
    {
      id: 'categories',
      label: 'Categorías del catálogo',
      role: 'builtin',
      canHide: true,
      faq: false,
      fields: [text('title', 'Título', 80)],
    },
    {
      id: 'spotlight',
      label: 'Producto protagonista',
      role: 'builtin',
      canHide: true,
      faq: false,
      description:
        'Destaca un producto disponible de tu selección, priorizando calzado. El precio y el enlace vienen del catálogo.',
      fields: [
        text('eyebrow', 'Antetítulo', 60),
        lines('title', 'Título', 100),
        lines('text', 'Texto', 240),
        text('cta', 'Botón al producto', 30),
        image('image', 'Imagen de campaña'),
      ],
    },
    {
      id: 'stories',
      label: 'Colecciones para descubrir',
      role: 'builtin',
      canHide: true,
      faq: false,
      fields: [
        text('title', 'Título de sección', 80),
        ...[1, 2].flatMap((n) => [
          text(`eyebrow${n}`, `Antetítulo ${n}`, 60),
          lines(`title${n}`, `Título ${n}`, 80),
          text(`cta${n}`, `Botón ${n}`, 30),
          image(`image${n}`, `Imagen ${n}`),
        ]),
      ],
    },
    {
      id: 'voices',
      label: 'Opiniones reales',
      role: 'builtin',
      canHide: true,
      faq: false,
      description: 'Publica solo testimonios reales con autorización. Sin opiniones, esta sección se oculta.',
      fields: [
        text('eyebrow', 'Antetítulo', 60),
        text('title', 'Título', 80),
        ...[1, 2, 3].flatMap((n) => [lines(`quote${n}`, `Opinión ${n}`, 300), text(`author${n}`, `Cliente ${n}`, 60)]),
      ],
    },
    {
      id: 'faq',
      label: 'Preguntas frecuentes',
      role: 'builtin',
      canHide: true,
      faq: true,
      fields: [text('title', 'Título', 80)],
    },
    {
      id: 'closing',
      label: 'Invitación final',
      role: 'builtin',
      canHide: true,
      faq: false,
      fields: [text('title', 'Título', 80), lines('text', 'Texto', 240), text('cta', 'Botón al catálogo', 30)],
    },
    ...libraryOf('stride'),
    ANNOUNCEMENT,
    PRODUCT_PAGE,
  ],
  classic: [
    {
      id: 'hero',
      label: 'Portada',
      role: 'builtin',
      canHide: true,
      faq: false,
      fields: [
        text('eyebrow', 'Antetítulo', 60),
        text('title', 'Título', 80),
        lines('text', 'Texto', 300),
        text('cta', 'Botón principal', 30),
        image('image', 'Imagen de portada'),
      ],
    },
    {
      id: 'featured',
      label: 'Destacados',
      role: 'builtin',
      canHide: false,
      faq: false,
      fields: [text('title', 'Título', 60)],
    },
    {
      id: 'how',
      label: 'Cómo comprar',
      role: 'builtin',
      canHide: true,
      faq: false,
      fields: [
        text('title', 'Título', 60),
        text('step1Title', 'Paso 1', 60),
        lines('step1Text', 'Detalle del paso 1', 200),
        text('step2Title', 'Paso 2', 60),
        lines('step2Text', 'Detalle del paso 2', 200),
        text('step3Title', 'Paso 3', 60),
        lines('step3Text', 'Detalle del paso 3', 200),
      ],
    },
    {
      id: 'faq', label: 'Preguntas frecuentes', role: 'builtin', canHide: true, faq: true,
      fields: [text('title', 'Título', 80)],
    },
    {
      id: 'closing', label: 'Cierre de compra', role: 'builtin', canHide: true, faq: false,
      fields: [text('title', 'Título', 80), lines('text', 'Texto', 240), text('cta', 'Botón hacia el catálogo', 30)],
    },
    ...libraryOf('classic'),
    ANNOUNCEMENT,
    PRODUCT_PAGE,
  ],
  selecta: [
    {
      id: 'hero',
      label: 'Portada',
      role: 'builtin',
      canHide: true,
      faq: false,
      fields: [
        text('eyebrow', 'Antetítulo', 60),
        lines('title', 'Título', 80),
        text('emphasis', 'Frase destacada', 80),
        lines('text', 'Texto', 300),
        text('cta', 'Botón', 30),
        text('note', 'Nota', 80),
        image('image', 'Imagen'),
        text('photoNote', 'Texto sobre la imagen', 40),
      ],
    },
    {
      id: 'collection',
      label: 'Colección',
      role: 'builtin',
      canHide: false,
      faq: false,
      fields: [text('eyebrow', 'Antetítulo', 60), text('title', 'Título', 80), lines('text', 'Texto', 120)],
    },
    {
      id: 'banner',
      label: 'Banner',
      role: 'builtin',
      canHide: true,
      faq: false,
      fields: [
        text('eyebrow', 'Antetítulo', 60),
        lines('title', 'Título', 100),
        text('emphasis', 'Frase destacada', 80),
        lines('text', 'Texto', 400),
        image('image', 'Imagen'),
      ],
    },
    {
      id: 'faq',
      label: 'Preguntas frecuentes',
      role: 'builtin',
      canHide: true,
      faq: true,
      fields: [text('eyebrow', 'Antetítulo', 60), lines('title', 'Título', 80), text('emphasis', 'Frase destacada', 80)],
    },
    ...libraryOf('selecta'),
    ANNOUNCEMENT,
    {
      id: 'footer',
      label: 'Pie de página',
      role: 'fixed',
      canHide: false,
      faq: false,
      fields: [text('closing', 'Frase de cierre', 60), lines('note', 'Nota', 400)],
    },
    PRODUCT_PAGE,
  ],
};

/**
 * Fields of every section type across templates. Content is validated against all of them so
 * switching templates keeps the texts written for the other one.
 */
const TYPE_FIELDS: Map<string, StoreEditorField[]> = (() => {
  const known = new Map<string, Map<string, StoreEditorField>>();
  for (const sections of Object.values(TEMPLATE_SECTIONS)) {
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

const BLOCK_TYPES = new Set(BLOCKS.map((block) => block.id));
const BLOCK_ID = /^([a-zA-Z]+)-([a-z0-9]{6})$/;

/** Section type of a content key: built-in ids are their type, blocks are `type-xxxxxx`. */
export function sectionType(id: string): string | null {
  if (TYPE_FIELDS.has(id) && !BLOCK_TYPES.has(id)) return id;
  const match = BLOCK_ID.exec(id);
  return match && BLOCK_TYPES.has(match[1]) ? match[1] : null;
}

export function defaultLayout(template: StoreTemplate): StoreLayoutItem[] {
  return TEMPLATE_SECTIONS[template].filter((s) => s.role === 'builtin').map((s) => ({ id: s.id, type: s.id }));
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
    // The template order itself is not stored, so a future default order still applies.
    if (JSON.stringify(layout) !== JSON.stringify(defaultLayout(template))) layouts[template] = layout;
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
export const TEMPLATE_THEME_OPTIONS: Record<StoreTemplate, StoreThemeOption[]> = {
  classic: ['logo', 'primary', 'accent', 'font', 'corners'],
  selecta: ['logo', 'primary', 'font'],
  stride: ['logo', 'primary', 'accent', 'font', 'corners'],
};

/**
 * Values a template uses when the merchant sets none: Classic follows the store settings,
 * Selecta keeps its own palette and monogram.
 */
export function themeDefaults(
  template: StoreTemplate,
  storefront: { brandColor: string; accentColor: string; logoUrl: string | null },
): Required<StoreTemplateTheme> {
  if (template === 'stride') {
    return { primary: '#181a18', accent: '#c8f542', font: 'modern', corners: 'square', logo: storefront.logoUrl ?? '' };
  }
  return template === 'selecta'
    ? { primary: '#4a1429', accent: '#23604a', font: 'editorial', corners: 'soft', logo: '' }
    : {
        primary: storefront.brandColor,
        accent: storefront.accentColor,
        font: 'modern',
        corners: 'soft',
        logo: storefront.logoUrl ?? '',
      };
}

function readTheme(value: unknown, allowImage: (url: string) => boolean): StoreTemplateTheme | undefined {
  const raw = asRecord(value);
  const theme: StoreTemplateTheme = {};
  for (const key of ['primary', 'accent'] as const) {
    const color = raw[key];
    if (typeof color === 'string' && HEX_COLOR.test(color)) theme[key] = color.toLowerCase();
  }
  if (THEME_FONTS.includes(raw['font'] as StoreThemeFont)) theme.font = raw['font'] as StoreThemeFont;
  if (THEME_CORNERS.includes(raw['corners'] as StoreThemeCorners)) theme.corners = raw['corners'] as StoreThemeCorners;
  const logo = typeof raw['logo'] === 'string' ? raw['logo'].trim() : null;
  if (logo === '' || (logo && logo.length <= MAX_IMAGE_URL && isHttpUrl(logo) && allowImage(logo))) theme.logo = logo;
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
      .flat()
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
  return [...Object.values(content.sections).flatMap(Object.values), content.theme?.logo ?? ''].filter((value) =>
    isHttpUrl(value),
  );
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
