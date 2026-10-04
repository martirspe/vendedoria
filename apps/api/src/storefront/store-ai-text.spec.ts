import type {
  StoreEditorField,
  StoreEditorSection,
} from '@vendedoria/contracts';
import {
  buildPagePrompt,
  buildSectionPrompt,
  buildTextPrompt,
  pickPageTexts,
  pickSectionTexts,
  pickSuggestions,
} from './store-ai-text';

const title: StoreEditorField = {
  id: 'title',
  label: 'Título',
  kind: 'text',
  maxLength: 40,
};
const base = {
  field: title,
  current: '',
  instruction: '',
  action: 'write' as const,
};

describe('store AI text', () => {
  it('cleans, trims to the field limit and deduplicates suggestions', () => {
    const picked = pickSuggestions(
      {
        suggestions: [
          '  "Belleza  que\nse nota"  ',
          'Belleza que se nota',
          'x'.repeat(60),
          12,
          '',
        ],
      },
      base,
    );
    expect(picked).toEqual(['Belleza que se nota', 'x'.repeat(40)]);
  });

  it('drops prices and discounts the merchant never wrote', () => {
    const raw = {
      suggestions: ['Todo a S/ 20', '30 % de descuento', 'Cuidamos tu piel'],
    };
    expect(pickSuggestions(raw, base)).toEqual(['Cuidamos tu piel']);
    expect(
      pickSuggestions(raw, {
        ...base,
        instruction: 'menciona el 30 % de descuento',
      }),
    ).toHaveLength(3);
  });

  it('never returns the current text as a new option, except when fixing it', () => {
    const raw = { suggestions: ['Hola', 'Hola mundo'] };
    expect(
      pickSuggestions(raw, { ...base, action: 'shorter', current: 'Hola' }),
    ).toEqual(['Hola mundo']);
    expect(
      pickSuggestions(raw, { ...base, action: 'fix', current: 'Hola' }),
    ).toEqual(['Hola']);
  });

  it('ignores malformed model output', () => {
    expect(pickSuggestions(null, base)).toEqual([]);
    expect(pickSuggestions({ suggestions: 'Hola' }, base)).toEqual([]);
  });

  it('gives the model only business facts and the field rules', () => {
    const { system, user } = buildTextPrompt({
      business: {
        name: 'Luma',
        industry: 'general',
        tagline: null,
        categories: ['Cremas'],
        products: ['Crema A'],
      },
      section: { label: 'Portada', description: undefined },
      field: title,
      siblings: { Texto: 'Hola' },
      current: '',
      instruction: '',
      action: 'write',
    });
    expect(system).toContain('máximo 40 caracteres');
    expect(system).toContain('No inventes precios');
    const payload = JSON.parse(user) as {
      negocio: { rubro: string | null; productos: string[] };
    };
    expect(payload.negocio.rubro).toBeNull();
    expect(payload.negocio.productos).toEqual(['Crema A']);
  });

  describe('sections', () => {
    const block: StoreEditorSection = {
      id: 'text',
      label: 'Texto destacado',
      role: 'block',
      canHide: true,
      faq: false,
      fields: [
        title,
        { id: 'text', label: 'Texto', kind: 'multiline', maxLength: 200 },
        { id: 'image', label: 'Imagen', kind: 'image', maxLength: 0 },
      ],
    };

    it('keeps only text fields of a known block, cleaned and without invented figures', () => {
      const raw = {
        type: 'text',
        texts: {
          title: 'Envío gratis desde S/ 99',
          text: '  Cuidamos\n\n\n\ncada detalle ',
          image: 'https://x.test/a.png',
          other: 'x',
        },
      };
      expect(pickSectionTexts(raw, [block], 'beneficios')).toEqual({
        type: 'text',
        texts: { text: 'Cuidamos\n\ncada detalle' },
      });
    });

    it('rejects unknown block types and empty answers', () => {
      expect(
        pickSectionTexts(
          { type: 'testimonials', texts: { title: 'Hola' } },
          [block],
          'opiniones',
        ),
      ).toBeNull();
      expect(
        pickSectionTexts(
          { type: 'text', texts: { title: '' } },
          [block],
          'algo',
        ),
      ).toBeNull();
      expect(pickSectionTexts(null, [block], 'algo')).toBeNull();
    });

    it('describes only the text fields of each offered block', () => {
      const { user } = buildSectionPrompt({
        business: {
          name: 'Luma',
          industry: 'belleza',
          tagline: null,
          categories: [],
          products: [],
        },
        blocks: [block],
        prompt: 'Nuestra historia',
      });
      const payload = JSON.parse(user) as {
        tiposDeSeccion: { campos: { id: string }[] }[];
      };
      expect(payload.tiposDeSeccion[0].campos.map((f) => f.id)).toEqual([
        'title',
        'text',
      ]);
    });
  });

  describe('page', () => {
    const hero: StoreEditorSection = {
      id: 'hero',
      label: 'Portada',
      role: 'builtin',
      canHide: true,
      faq: false,
      fields: [
        title,
        { id: 'image', label: 'Imagen', kind: 'image', maxLength: 0 },
      ],
    };
    const block = (id: string): StoreEditorSection => ({
      id,
      label: id,
      role: 'block',
      canHide: true,
      faq: false,
      fields: [title],
    });
    const request = {
      sections: [hero],
      blocks: ['text', 'benefits', 'cta', 'imageText', 'questions'].map(block),
      prompt: 'Mi tienda de cosmética',
    };

    it('keeps built-in texts and up to four distinct known blocks, in order', () => {
      const page = pickPageTexts(
        {
          sections: {
            hero: { title: 'Cuida tu piel', image: 'https://x.test/a.png' },
            how: { title: 'Nunca' },
          },
          blocks: [
            { type: 'benefits', texts: { title: 'Por qué elegirnos' } },
            { type: 'benefits', texts: { title: 'Repetido' } },
            { type: 'testimonials', texts: { title: 'Inventado' } },
            { type: 'cta', texts: { title: 'Todo a S/ 10' } },
            { type: 'text', texts: { title: 'Hecho a mano' } },
            { type: 'imageText', texts: { title: 'Nuestra historia' } },
            { type: 'questions', texts: { title: 'Dudas' } },
            { type: 'cta', texts: { title: 'Mira el catálogo' } },
          ],
        },
        request,
      );
      expect(page).toEqual({
        sections: { hero: { title: 'Cuida tu piel' } },
        blocks: [
          { type: 'benefits', texts: { title: 'Por qué elegirnos' } },
          { type: 'text', texts: { title: 'Hecho a mano' } },
          { type: 'imageText', texts: { title: 'Nuestra historia' } },
          { type: 'questions', texts: { title: 'Dudas' } },
        ],
      });
    });

    it('gives null when nothing usable came back', () => {
      expect(pickPageTexts({ sections: {}, blocks: [] }, request)).toBeNull();
      expect(pickPageTexts('nope', request)).toBeNull();
    });

    it('lists fixed sections and offered blocks with their text fields only', () => {
      const { user } = buildPagePrompt({
        ...request,
        business: {
          name: 'Luma',
          industry: 'belleza',
          tagline: null,
          categories: [],
          products: [],
        },
      });
      const payload = JSON.parse(user) as {
        seccionesFijas: { id: string; campos: { id: string }[] }[];
        tiposDeSeccion: { id: string }[];
      };
      expect(payload.seccionesFijas).toEqual([
        expect.objectContaining({
          id: 'hero',
          campos: [expect.objectContaining({ id: 'title' })],
        }),
      ]);
      expect(payload.tiposDeSeccion).toHaveLength(5);
    });
  });
});
