export const LEGAL_SLUGS = [
  'terminos-y-condiciones',
  'politica-de-privacidad',
  'politica-de-cookies',
  'envios-y-entregas',
  'cambios-y-devoluciones',
  'promociones-y-cupones',
] as const;

export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export const LEGAL_LINKS: { slug: LegalSlug; label: string }[] = [
  { slug: 'terminos-y-condiciones', label: 'Términos y condiciones' },
  { slug: 'politica-de-privacidad', label: 'Privacidad' },
  { slug: 'politica-de-cookies', label: 'Cookies' },
  { slug: 'envios-y-entregas', label: 'Envíos' },
  { slug: 'cambios-y-devoluciones', label: 'Cambios y devoluciones' },
  { slug: 'promociones-y-cupones', label: 'Promociones' },
];
