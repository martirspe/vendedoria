import type { SalesAgent } from '@prisma/client';

export const AGENT_QUALITY_MAX = 200;

type QualityKey =
  | 'name'
  | 'companyName'
  | 'companyDescription'
  | 'audienceDescription'
  | 'rulesText'
  | 'communicationStyle'
  | 'salesStyle'
  | 'initialMessage'
  | 'purchaseConfirmMessage'
  | 'handoffMessage'
  | 'responseLength';

type QualityField = {
  key: QualityKey;
  points: number;
  hint: string;
  minLength?: number;
};

const QUALITY_FIELDS: QualityField[] = [
  { key: 'name', points: 20, hint: 'Ponle un nombre memorable al vendedor', minLength: 2 },
  { key: 'companyName', points: 15, hint: 'Indica el nombre del negocio', minLength: 2 },
  {
    key: 'companyDescription',
    points: 20,
    hint: 'Describe qué vende el negocio',
    minLength: 20,
  },
  {
    key: 'audienceDescription',
    points: 20,
    hint: 'Define a quién le vende',
    minLength: 12,
  },
  {
    key: 'rulesText',
    points: 25,
    hint: 'Agrega reglas ALWAYS / NEVER',
    minLength: 12,
  },
  {
    key: 'communicationStyle',
    points: 15,
    hint: 'Define el estilo de comunicación',
    minLength: 4,
  },
  {
    key: 'salesStyle',
    points: 15,
    hint: 'Define el estilo de ventas',
    minLength: 4,
  },
  {
    key: 'initialMessage',
    points: 25,
    hint: 'Escribe el mensaje de bienvenida',
    minLength: 12,
  },
  {
    key: 'purchaseConfirmMessage',
    points: 15,
    hint: 'Agrega el mensaje de confirmación de compra',
    minLength: 8,
  },
  {
    key: 'handoffMessage',
    points: 20,
    hint: 'Configura el mensaje al escalar a humano',
    minLength: 8,
  },
  {
    key: 'responseLength',
    points: 10,
    hint: 'Elige la longitud de respuesta',
    minLength: 1,
  },
];

export type AgentQuality = {
  score: number;
  max: number;
  completedFields: number;
  totalFields: number;
  missingHints: string[];
};

export function computeAgentQuality(
  agent: Pick<SalesAgent, QualityKey>,
): AgentQuality {
  let score = 0;
  let completedFields = 0;
  const missingHints: string[] = [];

  for (const field of QUALITY_FIELDS) {
    const value = agent[field.key];
    const text = typeof value === 'string' ? value.trim() : '';
    const min = field.minLength ?? 1;
    if (text.length >= min) {
      score += field.points;
      completedFields += 1;
    } else {
      missingHints.push(field.hint);
    }
  }

  return {
    score,
    max: AGENT_QUALITY_MAX,
    completedFields,
    totalFields: QUALITY_FIELDS.length,
    missingHints: missingHints.slice(0, 4),
  };
}
