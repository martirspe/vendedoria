import type { StoreEditorField, StoreEditorSection, StoreTemplateContent } from '@vendedoria/contracts';
import {
  ContentHistory,
  addBlock,
  applyPage,
  canGenerateImage,
  clampValue,
  displayValue,
  isOverridden,
  layoutOf,
  moveItem,
  newBlockId,
  removeBlock,
  toggleHidden,
  typeOf,
  withFaq,
  withField,
  withLayout,
  withTheme,
  withoutField,
} from './template-editor';

describe('theme', () => {
  it('sets and resets style options, dropping the theme when nothing is left', () => {
    const base: StoreTemplateContent = { version: 1, sections: {} };
    const colored = withTheme(withTheme(base, 'primary', '#112233'), 'font', 'editorial');
    expect(colored.theme).toEqual({ primary: '#112233', font: 'editorial' });
    expect(withTheme(colored, 'primary', undefined).theme).toEqual({ font: 'editorial' });
    expect(withTheme(withTheme(colored, 'primary', undefined), 'font', undefined)).toEqual(base);
    expect(withTheme(base, 'logo', '').theme).toEqual({ logo: '' });
  });
});

const empty: StoreTemplateContent = { version: 1, sections: {} };
const text: StoreEditorField = { id: 'cta', label: 'Botón', kind: 'text', maxLength: 10 };
const lines: StoreEditorField = { id: 'text', label: 'Texto', kind: 'multiline', maxLength: 20 };

describe('template editor content', () => {
  it('shows the merchant value, else the text the store reported', () => {
    const snapshot = { fields: { 'hero.title': 'Por defecto' }, faq: [], sections: ['hero'] };
    expect(displayValue(empty, snapshot, 'hero', 'title')).toBe('Por defecto');
    const edited = withField(empty, 'hero', 'title', '');
    expect(displayValue(edited, snapshot, 'hero', 'title')).toBe('');
    expect(isOverridden(edited, 'hero', 'title')).toBe(true);
  });

  it('restores a field and drops empty sections', () => {
    const edited = withField(withField(empty, 'hero', 'title', 'A'), 'hero', 'text', 'B');
    expect(withoutField(edited, 'hero', 'title').sections).toEqual({ hero: { text: 'B' } });
    expect(withoutField(withoutField(edited, 'hero', 'title'), 'hero', 'text').sections).toEqual({});
  });

  it('clamps like the API: one line for text, limit for both', () => {
    expect(clampValue(text, 'Ver\nproductos ya')).toBe('Ver produc');
    expect(clampValue(lines, 'Uno\nDos')).toBe('Uno\nDos');
  });

  it('offers AI photos on image fields, except the real-photo gallery', () => {
    const image: StoreEditorField = { id: 'image', label: 'Imagen', kind: 'image', maxLength: 0 };
    expect(canGenerateImage('hero', image)).toBe(true);
    expect(canGenerateImage('imageText-a1b2c3', image)).toBe(true);
    expect(canGenerateImage('gallery-a1b2c3', { ...image, id: 'image1' })).toBe(false);
    expect(canGenerateImage('hero', text)).toBe(false);
  });

  it('sets and clears own questions', () => {
    const faq = Array.from({ length: 15 }, (_, i) => ({ question: `P${i}`, answer: `R${i}` }));
    expect(withFaq(empty, faq).faq).toHaveLength(12);
    expect('faq' in withFaq(withFaq(empty, faq), undefined)).toBe(false);
  });
});

describe('content history', () => {
  it('merges quick typing on one field and undoes/redoes whole states', () => {
    const history = new ContentHistory();
    const a = empty;
    const b = withField(a, 'hero', 'title', 'H');
    const c = withField(b, 'hero', 'title', 'Ho');
    history.record(a, 'hero.title', 0);
    history.record(b, 'hero.title', 500);
    expect(history.undo(c)).toBe(a);
    expect(history.canUndo).toBe(false);
    expect(history.redo(a)).toBe(c);
  });

  it('starts a new step on another field or after a pause, and clears redo on change', () => {
    const history = new ContentHistory();
    const a = empty;
    const b = withField(a, 'hero', 'title', 'H');
    const c = withField(b, 'hero', 'text', 'T');
    history.record(a, 'hero.title', 0);
    history.record(b, 'hero.text', 100);
    expect(history.undo(c)).toBe(b);
    history.record(b, 'hero.cta', 5000);
    expect(history.canRedo).toBe(false);
  });
});

describe('home layout', () => {
  const section = (id: string, role: StoreEditorSection['role'], defaults?: Record<string, string>): StoreEditorSection => ({
    id,
    label: id,
    role,
    canHide: true,
    faq: false,
    fields: [],
    defaults,
  });
  const schema = [
    section('hero', 'builtin'),
    section('faq', 'builtin'),
    section('text', 'block', { title: 'Título inicial' }),
    section('footer', 'fixed'),
  ];

  it('uses the template order and completes a saved one with missing built-ins', () => {
    expect(layoutOf(empty, 'selecta', schema).map((i) => i.id)).toEqual(['hero', 'faq']);
    const saved = withLayout(empty, 'selecta', [
      { id: 'faq', type: 'faq', hidden: true },
      { id: 'footer', type: 'footer' },
      { id: 'faq', type: 'faq' },
    ]);
    expect(layoutOf(saved, 'selecta', schema)).toEqual([
      { id: 'faq', type: 'faq', hidden: true },
      { id: 'hero', type: 'hero' },
    ]);
    expect(layoutOf(saved, 'classic', schema).map((i) => i.id)).toEqual(['hero', 'faq']);
  });

  it('moves and hides items', () => {
    const layout = layoutOf(empty, 'selecta', schema);
    expect(moveItem(layout, 'faq', 0).map((i) => i.id)).toEqual(['faq', 'hero']);
    expect(moveItem(layout, 'hero', 99).map((i) => i.id)).toEqual(['faq', 'hero']);
    const hidden = toggleHidden(layout, 'hero');
    expect(hidden[0]).toEqual({ id: 'hero', type: 'hero', hidden: true });
    expect(toggleHidden(hidden, 'hero')[0]).toEqual({ id: 'hero', type: 'hero' });
  });

  it('adds a block after the selected section with its texts, and removes it with them', () => {
    const layout = layoutOf(empty, 'selecta', schema);
    const id = newBlockId('text', () => 0);
    expect(id).toBe('text-aaaaaa');
    const added = addBlock(empty, 'selecta', layout, schema[2], id, 'hero');
    expect(added.layouts?.['selecta']?.map((i) => i.id)).toEqual(['hero', id, 'faq']);
    expect(added.sections[id]).toEqual({ title: 'Título inicial' });
    expect(addBlock(empty, 'selecta', layout, schema[2], id, null).layouts?.['selecta']?.at(-1)?.id).toBe(id);
    const removed = removeBlock(added, 'selecta', layoutOf(added, 'selecta', schema), id);
    expect(removed.sections[id]).toBeUndefined();
    expect(removed.layouts?.['selecta']?.map((i) => i.id)).toEqual(['hero', 'faq']);
    expect(typeOf(id)).toBe('text');
    expect(typeOf('hero')).toBe('hero');
  });

  it('applies a generated page: built-in texts, and new blocks in place of the old ones below the cover', () => {
    const withTitle = (s: StoreEditorSection): StoreEditorSection => ({ ...s, fields: [{ ...text, id: 'title', maxLength: 20 }] });
    const pageSchema = [withTitle(schema[0]), schema[1], withTitle(schema[2]), withTitle(section('cta', 'block'))];
    const ids = ['text-aaaaaa', 'cta-bbbbbb'];
    const start = addBlock(
      withField(empty, 'hero', 'image', 'https://x.test/a.webp'),
      'selecta',
      [{ id: 'hero', type: 'hero', hidden: true }, { id: 'faq', type: 'faq' }],
      pageSchema[2],
      'text-zzzzzz',
      'faq',
    );
    const page = applyPage(
      start,
      'selecta',
      pageSchema,
      {
        sections: { hero: { title: 'Cuida tu piel' }, faq: { title: 'Nada' } },
        blocks: [
          { type: 'text', texts: { title: 'Hecho a mano' } },
          { type: 'testimonials', texts: { title: 'Inventado' } },
          { type: 'cta', texts: { title: 'Mira todo' } },
        ],
      },
      () => ids.shift() ?? 'x',
    );
    expect(page.layouts?.['selecta']).toEqual([
      { id: 'hero', type: 'hero', hidden: true },
      { id: 'text-aaaaaa', type: 'text' },
      { id: 'cta-bbbbbb', type: 'cta' },
      { id: 'faq', type: 'faq' },
    ]);
    expect(page.sections).toEqual({
      hero: { image: 'https://x.test/a.webp', title: 'Cuida tu piel' },
      'text-aaaaaa': { title: 'Hecho a mano' },
      'cta-bbbbbb': { title: 'Mira todo' },
    });
    const textsOnly = applyPage(start, 'selecta', pageSchema, { sections: { hero: { title: 'Hola' } }, blocks: [] });
    expect(textsOnly.layouts?.['selecta']?.map((i) => i.id)).toEqual(['hero', 'faq', 'text-zzzzzz']);
    const withProducts = applyPage(
      empty,
      'classic',
      [...pageSchema, section('featured', 'builtin')],
      { sections: {}, blocks: [{ type: 'cta', texts: { title: 'Mira todo' } }] },
      () => 'cta-cccccc',
    );
    expect(withProducts.layouts?.['classic']?.map((i) => i.id)).toEqual(['hero', 'faq', 'featured', 'cta-cccccc']);
  });
});
