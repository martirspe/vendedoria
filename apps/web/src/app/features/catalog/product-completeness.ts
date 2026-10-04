import type { ProductDetails, ProductKind } from '../../core/api/catalog-api.service';

export type CompletenessInput = {
  kind: ProductKind;
  categories: string[];
  photos: number;
  details: ProductDetails | null;
  descriptionFull?: string | null;
  durationMinutes?: number | null;
  serviceMode?: string | null;
  digitalAccessUrl?: string | null;
};

export type CompletenessItem = { id: string; label: string; done: boolean };

/** What the seller needs to recommend a product well, beyond the fields required to publish. */
export function productCompleteness(input: CompletenessInput): {
  items: CompletenessItem[];
  score: number;
} {
  const d = input.details ?? {};
  const has = (list: unknown[] | undefined) => (list?.length ?? 0) > 0;
  const service = input.kind === 'SERVICE';
  const digital = input.kind === 'DIGITAL';
  const items: CompletenessItem[] = [
    { id: 'photo', label: 'Al menos 1 foto', done: input.photos > 0 },
    { id: 'category', label: 'Categoría', done: input.categories.length > 0 },
    { id: 'audience', label: 'Para quién es', done: Boolean(d.audience?.trim()) },
    { id: 'description', label: 'Descripción detallada', done: Boolean(input.descriptionFull?.trim()) },
    { id: 'useCases', label: 'Necesidades y ocasiones de uso', done: has(d.useCases) },
    service
      ? { id: 'contents', label: 'Qué incluye el servicio', done: has(d.contents) }
      : {
          id: 'specs',
          label: 'Características o beneficios',
          done: has(d.attributes) || has(d.benefits) || Boolean(d.size?.trim()),
        },
    { id: 'faqs', label: 'Al menos 1 pregunta frecuente', done: has(d.faqs) },
    { id: 'keywords', label: 'Palabras con las que te buscan', done: has(d.keywords) },
  ];
  if (service) {
    items.push(
      { id: 'duration', label: 'Duración del servicio', done: (input.durationMinutes ?? 0) > 0 },
      { id: 'mode', label: 'Modalidad de atención', done: Boolean(input.serviceMode) },
      { id: 'cancellation', label: 'Reprogramación y cancelación', done: Boolean(d.cancellation?.trim()) },
    );
    if (input.serviceMode === 'home') items.push({ id: 'coverage', label: 'Zona de atención a domicilio', done: Boolean(d.coverage?.trim()) });
  } else {
    items.push({ id: 'contents', label: 'Contenido incluido', done: has(d.contents) });
    items.push({ id: 'conditions', label: 'Garantía o condiciones de cambios', done: Boolean(d.warranty?.trim() || d.returns?.trim()) });
  }
  if (digital) items.push(
    { id: 'access', label: 'Enlace de entrega configurado', done: Boolean(input.digitalAccessUrl?.trim()) },
    { id: 'format', label: 'Formato o plataforma de acceso', done: Boolean(d.digitalFormat?.trim()) },
    { id: 'license', label: 'Licencia y derechos de uso', done: Boolean(d.license?.trim()) },
    { id: 'accessDuration', label: 'Duración del acceso y actualizaciones', done: Boolean(d.accessDuration?.trim()) },
  );
  const done = items.filter((item) => item.done).length;
  return { items, score: Math.round((done / items.length) * 100) };
}

/** Useful prompts by category; merchants keep control of the actual specifications. */
export function specificationHint(categories: string[]): string {
  const category = categories.join(' ').toLowerCase();
  if (/ropa|polo|camis|calzad|zapato|vestid/.test(category)) return 'Material: algodón\nTallas: S, M y L\nMedidas (cm): consulta la guía de tallas';
  if (/electron|comput|celular|tecnolog/.test(category)) return 'Modelo: ...\nCompatibilidad: ...\nCapacidad: ...\nDimensiones (cm): ...';
  if (/belleza|perfume|cosmet|crema/.test(category)) return 'Presentación (ml): ...\nIngredientes: ...\nTipo de piel: ...';
  if (/alimento|comida|bebida/.test(category)) return 'Contenido neto (g): ...\nIngredientes: ...\nAlérgenos: ...\nConservación: ...';
  return 'Material: ...\nDimensiones (cm): ...\nPeso (g): ...';
}
