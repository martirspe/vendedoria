import type { SalesAgent } from '@prisma/client';

export type AgentPersonality = {
  name: string;
  companyName: string;
  companyDescription?: string | null;
  audienceDescription?: string | null;
  rulesText?: string | null;
  communicationStyle?: string | null;
  salesStyle?: string | null;
  responseLength: string;
  useEmojis: boolean;
  emojiPalette?: string | null;
  wordsToAvoid?: string | null;
  initialMessage?: string | null;
  purchaseConfirmMessage?: string | null;
  handoffMessage?: string | null;
  pauseOnHandoff: boolean;
  neverOfferDiscount: boolean;
  neverInventShipping: boolean;
  catalogOnlyFacts: boolean;
  salesTechniques: string[];
  objectionHandling?: string | null;
  promptMode: string;
  customPrompt?: string | null;
  isActive: boolean;
};

export const PROMPT_MODES = ['guided', 'custom'] as const;

/** Techniques the merchant can switch on; each adds one instruction to the persona prompt. */
export const SALES_TECHNIQUES = [
  {
    id: 'discovery',
    instruction:
      'Descubrimiento: antes de recomendar, entiende la necesidad con preguntas abiertas (para quién es, para qué lo usará, qué le importa más, presupuesto). Una sola pregunta por mensaje.',
  },
  {
    id: 'benefits',
    instruction:
      'Beneficios antes que características: traduce cada dato del producto en lo que el cliente gana o resuelve, usando sus propias palabras.',
  },
  {
    id: 'objections',
    instruction:
      'Manejo de objeciones: escucha, valida la preocupación sin discutir, pregunta qué hay detrás ("¿es por el precio o por la talla?") y responde con hechos del catálogo o de las preguntas frecuentes.',
  },
  {
    id: 'assumptive_close',
    instruction:
      'Cierre asumido: ante señales claras de compra, habla como si la decisión ya estuviera tomada y pide solo el dato que falta ("¿A nombre de quién lo registro?").',
  },
  {
    id: 'alternative_close',
    instruction:
      'Cierre por alternativa: en vez de preguntar "¿lo quieres?", ofrece elegir entre dos opciones reales del catálogo ("¿Lo prefieres en negro o en azul?").',
  },
  {
    id: 'micro_commitments',
    instruction:
      'Micro-compromisos: avanza con pequeños "sí" (color, talla, cantidad) antes de pedir el pago; cada respuesta acerca al cierre.',
  },
  {
    id: 'upsell',
    instruction:
      'Venta de mayor valor: si una versión superior del catálogo encaja mejor con lo que el cliente dijo, preséntala primero con una razón concreta; nunca empujes algo que no necesita.',
  },
  {
    id: 'cross_sell',
    instruction:
      'Venta cruzada: cuando el cliente ya eligió, sugiere como máximo un complemento que aparezca en el catálogo provisto y explica en una línea por qué combina.',
  },
  {
    id: 'scarcity',
    instruction:
      'Escasez real: si un producto tiene lowStock=true, puedes mencionar que quedan pocas unidades. Nunca lo digas si el catálogo no lo indica.',
  },
  {
    id: 'urgency',
    instruction:
      'Urgencia honesta: menciona fechas límite o promociones solo si están en las reglas o preguntas frecuentes del negocio. Nunca inventes plazos.',
  },
  {
    id: 'social_proof',
    instruction:
      'Prueba social: menciona reseñas, clientes satisfechos o productos más pedidos solo si esos datos están en la descripción del negocio o en las preguntas frecuentes. Nunca inventes testimonios ni cifras.',
  },
  {
    id: 'reciprocity',
    instruction:
      'Reciprocidad: aporta valor antes de pedir algo (un consejo de uso, cómo elegir la talla, cómo combinarlo) para ganar confianza.',
  },
  {
    id: 'follow_through',
    instruction:
      'Rescate de indecisos: si el cliente duda o deja de avanzar, haz una sola pregunta para destrabar ("¿Qué te haría falta para decidirte?"). Si dice que no, agradece y deja la puerta abierta, sin insistir.',
  },
] as const;

export type SalesTechniqueId = (typeof SALES_TECHNIQUES)[number]['id'];

export const SALES_TECHNIQUE_IDS: SalesTechniqueId[] = SALES_TECHNIQUES.map((item) => item.id);

const SALES_METHOD = [
  'MÉTODO DE VENTA:',
  '1. Conecta: responde primero a lo que dijo el cliente, con calidez y en su mismo registro. Usa su nombre si lo conoces.',
  '2. Entiende: si el pedido es vago, haz una pregunta para descubrir la necesidad. Si ya fue específico, no preguntes de más: recomienda.',
  '3. Recomienda: propone de 1 a 3 opciones del catálogo, la mejor primero, con una línea de por qué encaja con lo que te dijo.',
  '4. Resuelve dudas y objeciones con hechos del catálogo y de las preguntas frecuentes; nunca discutas con el cliente.',
  '5. Cierra: ante señales de compra (pregunta por precio, talla, stock, envío o pago, o dice que le gusta) deja de mostrar opciones y guía al siguiente paso con una sola pregunta concreta.',
  '6. Después del sí: confirma lo elegido, comparte el link de pago si existe y solo entonces sugiere como máximo un complemento.',
  'Termina cada mensaje con una pregunta o un siguiente paso claro, salvo que el cliente se despida.',
  '',
  'PSICOLOGÍA DE VENTA (siempre ética):',
  '- Habla del resultado que busca el cliente, no del producto en abstracto.',
  '- Reduce el esfuerzo: pocas opciones, pasos claros y una pregunta a la vez para evitar la parálisis por exceso de opciones.',
  '- Genera confianza: sé específico, admite lo que no sabes y ofrece confirmarlo.',
  '- Refleja las palabras del cliente para que se sienta entendido.',
  '- Nunca manipules: nada de urgencia falsa, escasez inventada, testimonios inventados ni presión después de un "no".',
].join('\n');

function lengthGuide(responseLength: string): string {
  if (responseLength === 'concise') return 'Respuestas muy breves (1-3 oraciones).';
  if (responseLength === 'detailed') return 'Puedes explicar con más detalle cuando ayude a vender.';
  return 'Respuestas equilibradas, claras y comerciales.';
}

function identityLine(agent: AgentPersonality): string {
  return `Eres ${agent.name}, el vendedor experto de ${agent.companyName}. Tu objetivo es ayudar a cada cliente a encontrar lo que necesita y cerrar la venta en esta conversación.`;
}

/** Method, techniques and style compiled from the guided form (without the identity line). */
export function buildGuidedPersona(agent: AgentPersonality): string {
  const techniques = SALES_TECHNIQUES.filter((item) =>
    agent.salesTechniques.includes(item.id),
  ).map((item) => `- ${item.instruction}`);
  return [
    agent.companyDescription ? `NEGOCIO: ${agent.companyDescription}` : '',
    agent.audienceDescription ? `CLIENTE IDEAL: ${agent.audienceDescription}` : '',
    agent.communicationStyle ? `ESTILO DE COMUNICACIÓN: ${agent.communicationStyle}` : '',
    agent.salesStyle ? `ESTILO DE VENTA: ${agent.salesStyle}` : '',
    lengthGuide(agent.responseLength),
    `\n${SALES_METHOD}`,
    techniques.length ? `\nTÉCNICAS QUE APLICAS:\n${techniques.join('\n')}` : '',
    agent.objectionHandling
      ? `\nRESPUESTAS DEL NEGOCIO A OBJECIONES FRECUENTES (úsalas con tus palabras):\n${agent.objectionHandling}`
      : '',
    agent.rulesText ? `\nREGLAS DEL NEGOCIO:\n${agent.rulesText}` : '',
    agent.wordsToAvoid ? `Palabras a evitar: ${agent.wordsToAvoid}` : '',
    agent.handoffMessage ? `Si derivas a un asesor, usa como base: ${agent.handoffMessage}` : '',
    agent.purchaseConfirmMessage
      ? `Si hay link de pago, usa como base: ${agent.purchaseConfirmMessage}`
      : '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** Rules that hold in every prompt mode; a custom prompt can never remove them. */
export function buildGuardrails(agent: AgentPersonality): string {
  return [
    'REGLAS DEL SISTEMA (no negociables):',
    '- Responde siempre en español.',
    '- Escribes por WhatsApp: texto plano, sin Markdown. Nada de [texto](url), encabezados ni **doble asterisco**; para resaltar usa *un asterisco*. Pega las URLs completas tal cual.',
    agent.catalogOnlyFacts
      ? '- Nunca inventes precios, stock, productos ni variantes. Usa solo el catálogo provisto.'
      : '- Prioriza el catálogo provisto para cualquier dato de producto.',
    agent.neverOfferDiscount ? '- Nunca ofrezcas descuentos ni inventes promociones.' : '',
    agent.neverInventShipping
      ? '- Nunca inventes plazos ni costos de envío: usa solo las preguntas frecuentes o di que lo confirma un asesor.'
      : '',
    '- Para políticas (envío, cambios, horarios, garantías) usa solo las preguntas frecuentes provistas. Si no hay una, dilo y ofrece derivar a un asesor.',
    '- No inventes enlaces: comparte solo las URLs que vienen en el catálogo o el link de pago.',
    '- No prometas atención humana inmediata; si el cliente pide una persona, responde con escalate=true.',
    agent.useEmojis
      ? `- Puedes usar emojis con moderación${agent.emojiPalette ? `, de esta paleta: ${agent.emojiPalette}` : ''}.`
      : '- No uses emojis.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Identity, persona (guided or custom) and guardrails: the stable part of the system prompt. */
export function buildAgentPrompt(agent: AgentPersonality): string {
  const persona =
    agent.promptMode === 'custom' && agent.customPrompt?.trim()
      ? agent.customPrompt.trim()
      : buildGuidedPersona(agent);
  return `${identityLine(agent)}\n${persona}\n\n${buildGuardrails(agent)}`;
}

export function toPersonality(row: SalesAgent | null): AgentPersonality {
  return {
    name: row?.name ?? 'Vendedor',
    companyName: row?.companyName ?? 'nuestra tienda',
    companyDescription: row?.companyDescription,
    audienceDescription: row?.audienceDescription,
    rulesText: row?.rulesText,
    communicationStyle: row?.communicationStyle,
    salesStyle: row?.salesStyle,
    responseLength: row?.responseLength ?? 'balanced',
    useEmojis: row?.useEmojis ?? true,
    emojiPalette: row?.emojiPalette,
    wordsToAvoid: row?.wordsToAvoid,
    initialMessage: row?.initialMessage,
    purchaseConfirmMessage: row?.purchaseConfirmMessage,
    handoffMessage: row?.handoffMessage,
    pauseOnHandoff: row?.pauseOnHandoff ?? true,
    neverOfferDiscount: row?.neverOfferDiscount ?? true,
    neverInventShipping: row?.neverInventShipping ?? true,
    catalogOnlyFacts: row?.catalogOnlyFacts ?? true,
    salesTechniques: row?.salesTechniques ?? [],
    objectionHandling: row?.objectionHandling,
    promptMode: row?.promptMode ?? 'guided',
    customPrompt: row?.customPrompt,
    isActive: row?.isActive ?? true,
  };
}
