import type { DsIconName } from '@vendedoria/ui';

export type SellerSectionId =
  | 'profile'
  | 'personality'
  | 'sales'
  | 'knowledge'
  | 'rules'
  | 'advanced';

export type SellerSection = {
  id: SellerSectionId;
  label: string;
  hint: string;
  icon: DsIconName;
};

export const SELLER_SECTIONS: SellerSection[] = [
  { id: 'profile', label: 'Perfil y canales', hint: 'Nombre, negocio, cliente ideal y dónde atiende', icon: 'user' },
  { id: 'personality', label: 'Personalidad', hint: 'Tono, estilo y mensajes clave', icon: 'sparkles' },
  { id: 'sales', label: 'Técnicas de venta', hint: 'Cómo descubre, persuade y cierra', icon: 'target' },
  { id: 'knowledge', label: 'Conocimiento', hint: 'Preguntas frecuentes y políticas', icon: 'bookOpen' },
  { id: 'rules', label: 'Reglas y derivación', hint: 'Límites y paso a un asesor', icon: 'shieldCheck' },
  { id: 'advanced', label: 'Prompt avanzado', hint: 'Instrucciones completas para expertos', icon: 'slidersHorizontal' },
];

export function asSellerSection(value: string | null): SellerSectionId | null {
  return SELLER_SECTIONS.some((section) => section.id === value)
    ? (value as SellerSectionId)
    : null;
}

export type SalesTechniqueGroup = 'discover' | 'persuade' | 'close';

/** Ids must match `SALES_TECHNIQUES` in apps/api/src/agent-runtime/sales-playbook.ts. */
export const SALES_TECHNIQUES: Array<{
  id: string;
  group: SalesTechniqueGroup;
  label: string;
  description: string;
}> = [
  { id: 'discovery', group: 'discover', label: 'Preguntas de descubrimiento', description: 'Entiende para quién es, para qué y qué le importa antes de recomendar. Una pregunta por mensaje.' },
  { id: 'reciprocity', group: 'discover', label: 'Aporta valor primero', description: 'Da un consejo útil (talla, uso, combinación) antes de pedir algo a cambio.' },
  { id: 'benefits', group: 'persuade', label: 'Beneficios, no características', description: 'Traduce cada dato del producto en lo que el cliente gana, con sus propias palabras.' },
  { id: 'objections', group: 'persuade', label: 'Manejo de objeciones', description: 'Escucha, valida, pregunta qué hay detrás y responde con hechos del catálogo.' },
  { id: 'social_proof', group: 'persuade', label: 'Prueba social', description: 'Menciona reseñas o lo más pedido solo si lo escribiste en tu negocio o preguntas frecuentes.' },
  { id: 'scarcity', group: 'persuade', label: 'Escasez real', description: 'Avisa que quedan pocas unidades solo cuando tu stock lo confirma (5 o menos).' },
  { id: 'urgency', group: 'persuade', label: 'Urgencia honesta', description: 'Usa fechas límite o promociones solo si están en tus reglas o preguntas frecuentes.' },
  { id: 'upsell', group: 'persuade', label: 'Opción de mayor valor', description: 'Presenta primero la versión superior cuando de verdad encaja con lo que pidió.' },
  { id: 'micro_commitments', group: 'close', label: 'Pequeños sí', description: 'Avanza con decisiones pequeñas (color, talla, cantidad) antes del pago.' },
  { id: 'alternative_close', group: 'close', label: 'Cierre por alternativa', description: '“¿Lo prefieres en negro o en azul?” en lugar de “¿lo quieres?”.' },
  { id: 'assumptive_close', group: 'close', label: 'Cierre asumido', description: 'Ante señales claras de compra, pide solo el dato que falta para registrar el pedido.' },
  { id: 'cross_sell', group: 'close', label: 'Venta cruzada', description: 'Después del sí, sugiere un solo complemento del catálogo que combine.' },
  { id: 'follow_through', group: 'close', label: 'Rescate de indecisos', description: 'Si duda, una pregunta para destrabar; si dice que no, agradece sin insistir.' },
];

export const TECHNIQUE_GROUPS: Array<{ id: SalesTechniqueGroup; label: string; hint: string }> = [
  { id: 'discover', label: 'Descubrir', hint: 'Entender qué necesita' },
  { id: 'persuade', label: 'Persuadir', hint: 'Mostrar por qué le conviene' },
  { id: 'close', label: 'Cerrar', hint: 'Llevar al pago sin presionar' },
];

export type SellerPreset = {
  id: string;
  label: string;
  description: string;
  communicationStyle: string;
  salesStyle: string;
  responseLength: 'concise' | 'balanced' | 'detailed';
  salesTechniques: string[];
};

export const SELLER_PRESETS: SellerPreset[] = [
  {
    id: 'consultative',
    label: 'Asesor consultivo',
    description: 'Escucha, pregunta y recomienda la mejor opción. Ideal para productos con variedad.',
    communicationStyle: 'Cercano y profesional; escucha antes de recomendar',
    salesStyle: 'Consultivo: pregunta, entiende la necesidad y recomienda la opción que mejor encaja',
    responseLength: 'balanced',
    salesTechniques: ['discovery', 'benefits', 'objections', 'micro_commitments', 'alternative_close', 'cross_sell'],
  },
  {
    id: 'friendly',
    label: 'Amigo que sabe',
    description: 'Cálido y espontáneo, recomienda como a un amigo. Ideal para moda y belleza.',
    communicationStyle: 'Cálido, juvenil y espontáneo, como un amigo que sabe del tema',
    salesStyle: 'Entusiasta y honesto: recomienda lo que de verdad le sirve y lo dice con confianza',
    responseLength: 'concise',
    salesTechniques: ['discovery', 'reciprocity', 'benefits', 'alternative_close', 'cross_sell', 'follow_through'],
  },
  {
    id: 'premium',
    label: 'Especialista premium',
    description: 'Elegante y experto, resalta calidad y valor. Ideal para tickets altos.',
    communicationStyle: 'Elegante, preciso y seguro, con vocabulario cuidado',
    salesStyle: 'Experto que asesora con autoridad y justifica el valor antes que el precio',
    responseLength: 'detailed',
    salesTechniques: ['discovery', 'benefits', 'upsell', 'objections', 'social_proof', 'assumptive_close'],
  },
  {
    id: 'fast',
    label: 'Cierre rápido',
    description: 'Directo y ágil, lleva al pago en pocos mensajes. Ideal para compras por impulso.',
    communicationStyle: 'Directo, ágil y amable',
    salesStyle: 'Va al grano: confirma lo que busca y lo lleva al pago en pocos mensajes',
    responseLength: 'concise',
    salesTechniques: ['benefits', 'scarcity', 'micro_commitments', 'alternative_close', 'assumptive_close'],
  },
];

/** A profile is selected only while all the settings it applies still match. */
export function resolveSellerPreset(values: {
  personalityPreset?: string;
  communicationStyle: string;
  salesStyle: string;
  responseLength: string;
  salesTechniques: string[];
  promptMode: string;
}): string {
  if (values.personalityPreset === 'custom' || values.promptMode === 'custom') return 'custom';
  const techniques = new Set(values.salesTechniques);
  return SELLER_PRESETS.find((preset) =>
    preset.communicationStyle === values.communicationStyle &&
    preset.salesStyle === values.salesStyle &&
    preset.responseLength === values.responseLength &&
    preset.salesTechniques.length === techniques.size &&
    preset.salesTechniques.every((technique) => techniques.has(technique)),
  )?.id ?? 'custom';
}
