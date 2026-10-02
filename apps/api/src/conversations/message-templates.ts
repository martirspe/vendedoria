export type MessageTemplateDefinition = {
  id: string;
  name: string;
  language: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  body: string;
  description: string;
};

/** Local/dev approved-template catalog (Meta-shaped). Not production WABA sync. */
export const MESSAGE_TEMPLATES: MessageTemplateDefinition[] = [
  {
    id: 'hello_reengagement',
    name: 'hello_reengagement',
    language: 'es',
    category: 'UTILITY',
    body: 'Hola {{1}}, ¿sigues interesado en tu consulta? Estamos listos para ayudarte.',
    description: 'Reabrir conversación fuera de ventana 24h',
  },
  {
    id: 'order_followup',
    name: 'order_followup',
    language: 'es',
    category: 'UTILITY',
    body: 'Hola {{1}}, te escribimos por tu pedido. ¿Quieres el link de pago o ayuda con el envío?',
    description: 'Seguimiento de pedido / pago',
  },
  {
    id: 'catalog_nudge',
    name: 'catalog_nudge',
    language: 'es',
    category: 'MARKETING',
    body: 'Hola {{1}}, tenemos novedades en el catálogo. ¿Te muestro opciones?',
    description: 'Nudge suave de catálogo (marketing)',
  },
];

export function findMessageTemplate(id: string) {
  return MESSAGE_TEMPLATES.find((item) => item.id === id) ?? null;
}

export function renderTemplateBody(
  template: MessageTemplateDefinition,
  vars: string[],
): string {
  return template.body.replace(/\{\{(\d+)\}\}/g, (_, index: string) => {
    const value = vars[Number(index) - 1];
    return value?.trim() || 'cliente';
  });
}
