import {
  TEMPLATE_SECTIONS,
  effectiveTemplate,
  templateAllowed,
  themeDefaults,
  readTemplateContent,
  sameContent,
  sanitizeContent,
  withContentField,
} from './store-templates';

describe('template content', () => {
  it('validates semantic tokens, favicon ownership, bounded navigation and platform-specific social destinations', () => {
    const content = sanitizeContent({ version: 1, sections: {
      navigation: { label1: 'Catálogo', destination1: '/productos', destination2: 'javascript:alert(1)' },
      social: { instagram: 'https://www.instagram.com/shop', facebook: 'https://facebook.com.evil.test/a', tiktok: 'https://user@tiktok.com/a' },
    }, theme: { favicon: 'https://own.test/media/icon.webp', background: '#102030', text: 'red', container: 'wide', spacing: 'airy', typeScale: 'huge', customCss: 'evil' } }, url => url.startsWith('https://own.test/media/'));
    expect(content.sections['navigation']).toEqual({ label1: 'Catálogo', destination1: '/productos' });
    expect(content.sections['social']).toEqual({ instagram: 'https://www.instagram.com/shop' });
    expect(content.theme).toEqual({ favicon: 'https://own.test/media/icon.webp', background: '#102030', container: 'wide', spacing: 'airy' });
    expect(sanitizeContent({ sections: { social: { instagram: 'https://facebook.com/shop' } }, theme: { favicon: 'https://other.test/icon.svg' } }, () => false)).toEqual({ version: 1, sections: {} });
  });
  it('allows the fashion template only for fashion and retains its editable layout', () => {
    expect(templateAllowed('stride', 'moda')).toBe(true);
    expect(effectiveTemplate('stride', 'belleza')).toBe('classic');
    const content = sanitizeContent({
      sections: { spotlight: { title: 'Mi colección', image: '', unknown: 'drop' }, voices: { quote1: '', author1: '' } },
      layouts: { stride: [{ id: 'voices', type: 'voices', hidden: true }, { id: 'featured', type: 'featured', hidden: true }, { id: 'cta-a1b2c3', type: 'cta' }] },
    });
    expect(content.sections['spotlight']).toEqual({ title: 'Mi colección', image: '' });
    expect(content.sections['voices']).toEqual({ quote1: '', author1: '' });
    expect(content.layouts?.stride?.[0]).toEqual({ id: 'voices', type: 'voices', hidden: true });
    expect(content.layouts?.stride?.[1]).toEqual({ id: 'featured', type: 'featured' });
    expect(content.layouts?.stride).toContainEqual({ id: 'cta-a1b2c3', type: 'cta' });
    expect(themeDefaults('stride', { brandColor: '#ffffff', accentColor: '#000000', logoUrl: null })).toMatchObject({ primary: '#181a18', accent: '#c8f542', font: 'modern', corners: 'square', logo: '' });
  });

  it('keeps known fields only and drops anything else', () => {
    const content = sanitizeContent({
      version: 7,
      sections: {
        hero: { title: 'Hola', script: '<script>', unknown: 'x' },
        evil: { title: 'nope' },
      },
      extra: true,
    });
    expect(content).toEqual({ version: 1, sections: { hero: { title: 'Hola' } } });
  });

  it('keeps the texts of fixed sections outside the home: announcement bar and product page', () => {
    const content = sanitizeContent({
      sections: {
        announcement: { text: 'Envío gratis\nhoy', extra: 'x' },
        product: { whatsapp: '', note: 'Despacho en 24 h.\nSolo Lima.' },
      },
      layouts: { classic: [{ id: 'announcement', type: 'announcement' }] },
    });
    expect(content).toEqual({
      version: 1,
      sections: {
        announcement: { text: 'Envío gratis hoy' },
        product: { whatsapp: '', note: 'Despacho en 24 h.\nSolo Lima.' },
      },
    });
  });

  it('cleans text: single line fields collapse breaks, multiline keeps them', () => {
    const content = sanitizeContent({
      sections: {
        featured: { title: '  Lo   más\nvendido \u0007 ' },
        hero: { text: 'Línea 1\r\n\r\n\r\n\r\nLínea   2  ' },
      },
    });
    expect(content.sections['featured']['title']).toBe('Lo más vendido');
    expect(content.sections['hero']['text']).toBe('Línea 1\n\nLínea 2');
  });

  it('keeps breaks of a key that is multiline in another template', () => {
    expect(sanitizeContent({ sections: { hero: { title: 'Hay un ritual\nque lleva' } } }).sections['hero']['title']).toBe(
      'Hay un ritual\nque lleva',
    );
  });

  it('truncates to the field limit', () => {
    const content = sanitizeContent({ sections: { hero: { cta: 'x'.repeat(200) } } });
    expect(content.sections['hero']['cta']).toHaveLength(30);
  });

  it('keeps empty strings: they hide the text', () => {
    expect(sanitizeContent({ sections: { hero: { note: '   ' } } }).sections['hero']['note']).toBe('');
  });

  it('accepts only allowed http(s) images', () => {
    const allow = (url: string) => url.startsWith('https://cdn.example/media/t1/');
    const content = sanitizeContent(
      {
        sections: {
          hero: { image: 'https://cdn.example/media/t1/a.webp' },
          banner: { image: 'https://evil.example/pixel.gif' },
          collection: { title: 'ok' },
        },
      },
      allow,
    );
    expect(content.sections['hero']['image']).toBe('https://cdn.example/media/t1/a.webp');
    expect(content.sections['banner']).toBeUndefined();
    expect(sanitizeContent({ sections: { hero: { image: 'javascript:alert(1)' } } }).sections['hero']).toBeUndefined();
    expect(sanitizeContent({ sections: { hero: { image: '' } } }, () => false).sections['hero']['image']).toBe('');
  });

  it('reads FAQ rows with both parts, up to the limit', () => {
    const faq = Array.from({ length: 20 }, (_, i) => ({ question: `P${i}`, answer: `R${i}` }));
    const content = sanitizeContent({ sections: {}, faq: [{ question: '', answer: 'x' }, ...faq] });
    expect(content.faq).toHaveLength(12);
    expect(content.faq?.[0]).toEqual({ question: 'P0', answer: 'R0' });
  });

  it('normalizes a home layout: valid items once, built-ins always present, hide only where allowed', () => {
    const content = sanitizeContent({
      sections: {},
      layouts: {
        selecta: [
          { id: 'faq', type: 'faq', hidden: true },
          { id: 'imageText-a1b2c3', type: 'imageText' },
          { id: 'collection', type: 'collection', hidden: true },
          { id: 'faq', type: 'faq' },
          { id: 'footer', type: 'footer' },
          { id: 'hero', type: 'banner' },
          { id: 'text-zzzzzz', type: 'imageText' },
          { id: 'evil', type: 'text' },
          { id: 'text-q1w2e3', type: 'text', hidden: true, extra: 1 },
        ],
        other: [{ id: 'hero', type: 'hero' }],
      },
    });
    expect(content.layouts).toEqual({
      selecta: [
        { id: 'faq', type: 'faq', hidden: true },
        { id: 'imageText-a1b2c3', type: 'imageText' },
        { id: 'collection', type: 'collection' },
        { id: 'text-q1w2e3', type: 'text', hidden: true },
        { id: 'hero', type: 'hero' },
        { id: 'banner', type: 'banner' },
      ],
    });
  });

  it('preserves an explicit default order across future updates and caps library blocks', () => {
    const defaults = sanitizeContent({
      sections: {},
      layouts: { classic: [{ id: 'hero', type: 'hero' }, { id: 'featured', type: 'featured' }, { id: 'how', type: 'how' }, { id: 'faq', type: 'faq' }, { id: 'closing', type: 'closing' }] },
    });
    expect(defaults.layouts?.classic?.map(item => item.id)).toEqual(['hero', 'featured', 'how', 'faq', 'closing']);
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `text-blk00${i.toString(36)}`, type: 'text' }));
    const layout = sanitizeContent({ sections: {}, layouts: { classic: many } }).layouts?.classic ?? [];
    expect(layout.filter((item) => item.type === 'text')).toHaveLength(8);
    expect(layout.slice(-5).map((item) => item.id)).toEqual(['hero', 'featured', 'how', 'faq', 'closing']);
  });

  it('keeps texts of blocks in a layout and drops the ones of removed blocks', () => {
    const content = sanitizeContent({
      sections: {
        'imageText-a1b2c3': { title: 'Nuevo', cta: 'Ver', script: 'x' },
        'text-gone00': { title: 'Borrado' },
        'faq-a1b2c3': { title: 'No es un bloque' },
      },
      layouts: { classic: [{ id: 'imageText-a1b2c3', type: 'imageText' }] },
    });
    expect(content.sections).toEqual({ 'imageText-a1b2c3': { title: 'Nuevo', cta: 'Ver' } });
  });

  it('keeps design choices only when they are one of the options', () => {
    const content = sanitizeContent({
      sections: {
        'cta-a1b2c3': { tone: 'brand', title: 'Hola' },
        'text-a1b2c3': { tone: 'neon' },
        'imageText-a1b2c3': { layout: 'end', tone: 'soft' },
        'benefits-a1b2c3': { tone: '' },
      },
      layouts: {
        classic: ['cta-a1b2c3', 'text-a1b2c3', 'imageText-a1b2c3', 'benefits-a1b2c3'].map((id) => ({
          id,
          type: id.split('-')[0],
        })),
      },
    });
    expect(content.sections).toEqual({
      'cta-a1b2c3': { tone: 'brand', title: 'Hola' },
      'imageText-a1b2c3': { layout: 'end' },
      'benefits-a1b2c3': { tone: '' },
    });
  });

  it('offers the questions block only where the template has no FAQ section of its own', () => {
    const blocks = (template: 'classic' | 'selecta') =>
      TEMPLATE_SECTIONS[template].filter((s) => s.role === 'block').map((s) => s.id);
    expect(blocks('classic')).toContain('questions');
    expect(blocks('selecta')).not.toContain('questions');
    const imageText = (template: 'classic' | 'selecta') =>
      TEMPLATE_SECTIONS[template].find((s) => s.id === 'imageText')?.defaults?.['layout'];
    expect([imageText('classic'), imageText('selecta')]).toEqual(['start', 'end']);
  });

  it('keeps a valid theme only: hex colors, known font and corners, allowed logo', () => {
    const allowed = (url: string) => url.startsWith('https://cdn.example/');
    const content = sanitizeContent(
      {
        sections: {},
        theme: { primary: '#AA3366', accent: 'red', font: 'comic', corners: 'round', logo: 'https://cdn.example/l.webp' },
      },
      allowed,
    );
    expect(content.theme).toEqual({ primary: '#aa3366', corners: 'round', logo: 'https://cdn.example/l.webp' });
    expect(sanitizeContent({ sections: {}, theme: { logo: 'https://evil.example/x.png' } }, allowed).theme).toBeUndefined();
    expect(sanitizeContent({ sections: {}, theme: { logo: '' } }, allowed).theme).toEqual({ logo: '' });
  });

  it('reads null rows as empty content and compares content structurally', () => {
    const empty = readTemplateContent(null);
    expect(empty).toEqual({ version: 1, sections: {} });
    const edited = withContentField(empty, 'banner', 'image', 'https://cdn.example/b.webp');
    expect(sameContent(edited, readTemplateContent(edited))).toBe(true);
    expect(sameContent(edited, empty)).toBe(false);
  });
});
