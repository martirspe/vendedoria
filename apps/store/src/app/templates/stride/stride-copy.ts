import type { StorefrontView } from '@vendedoria/contracts';

/** Missing keys use commercial defaults; merchant empty strings stay empty. */
export function strideCopy(store: StorefrontView | null) {
  const text = (section: string, field: string, fallback: string) =>
    store?.templateContent.sections[section]?.[field] ?? fallback;
  return {
    hero: {
      eyebrow: text('hero', 'eyebrow', 'HECHO PARA MOVERTE'),
      title: text('hero', 'title', 'TU ESTILO.\nSIN LÍMITES.'),
      emphasis: text('hero', 'emphasis', 'A tu manera.'),
      text: text(
        'hero',
        'text',
        'Moda y calzado que van contigo. Encuentra ese próximo favorito y hazlo parte de tus días.',
      ),
      cta: text('hero', 'cta', 'Encontrar mi estilo'),
    },
    featured: {
      eyebrow: text(
        'featured',
        'eyebrow',
        'EL SIGUIENTE FAVORITO PODRÍA ESTAR AQUÍ',
      ),
      title: text('featured', 'title', 'Nuestra selección'),
    },
    editorial: [
      {
        n: 1,
        eyebrow: text('editorial', 'eyebrow1', 'MENOS VUELTAS. MÁS ESTILO.'),
        title: text('editorial', 'title1', 'Ese look que\nsí va contigo.'),
        text: text(
          'editorial',
          'text1',
          'Encuentra prendas y calzado para combinar a tu manera.',
        ),
        cta: text('editorial', 'cta1', 'Explorar catálogo'),
      },
      {
        n: 2,
        eyebrow: text('editorial', 'eyebrow2', 'DALE UN GIRO A TU DÍA'),
        title: text('editorial', 'title2', 'Nuevas piezas.\nNuevos planes.'),
        text: text(
          'editorial',
          'text2',
          'Descubre lo último del catálogo. Tu próximo look empieza con una buena elección.',
        ),
        cta: text('editorial', 'cta2', 'Ver novedades'),
      },
    ],
    categories: {
      title: text('categories', 'title', 'Encuentra lo que va contigo'),
    },
    spotlight: {
      eyebrow: text('spotlight', 'eyebrow', 'UN FAVORITO CON PERSONALIDAD'),
      title: text('spotlight', 'title', 'TU ESTILO.\nTU SIGUIENTE\nPASO.'),
      text: text(
        'spotlight',
        'text',
        'Mira los detalles, elige tus opciones y revisa su disponibilidad. El próximo paso es tuyo.',
      ),
      cta: text('spotlight', 'cta', 'Quiero verlo'),
    },
    stories: {
      title: text('stories', 'title', 'Más formas de llevarlo'),
      cards: [
        {
          n: 1,
          eyebrow: text('stories', 'eyebrow1', 'A TU RITMO'),
          title: text('stories', 'title1', 'Un look.\nMuchos planes.'),
          cta: text('stories', 'cta1', 'Descubrir la colección'),
        },
        {
          n: 2,
          eyebrow: text('stories', 'eyebrow2', 'TU PRÓXIMA ELECCIÓN'),
          title: text('stories', 'title2', 'Los detalles\nhacen tu estilo.'),
          cta: text('stories', 'cta2', 'Ver lo nuevo'),
        },
      ],
    },
    voices: {
      eyebrow: text('voices', 'eyebrow', 'EN SUS PALABRAS'),
      title: text('voices', 'title', 'Así lo llevan nuestros clientes'),
      quotes: [1, 2, 3]
        .map((n) => ({
          n,
          quote: text('voices', `quote${n}`, ''),
          author: text('voices', `author${n}`, ''),
        }))
        .filter((q) => q.quote && q.author),
    },
    faq: { title: text('faq', 'title', 'Elige con confianza') },
    closing: {
      title: text('closing', 'title', 'Que tu próximo look hable de ti.'),
      text: text(
        'closing',
        'text',
        'Tu estilo empieza con lo que eliges. Encuentra tus favoritos en el catálogo.',
      ),
      cta: text('closing', 'cta', 'Explorar catálogo'),
    },
  };
}
