/** One earlier turn of the chat as the sales agent sees it. */
export type ConversationTurn = {
  role: 'buyer' | 'agent';
  text: string;
  /** Catalog products the seller worked with in that turn. */
  productIds?: string[];
  /** Set when that turn browsed the catalog; `category` null means the whole catalog. */
  browse?: { category: string | null };
  /** Set when that turn asked for the delivery district before creating the order. */
  pendingDelivery?: { lines: PendingLine[] };
};

export type PendingLine = { productId: string; variantId: string | null; quantity: number };

export type AgentContext = {
  history: ConversationTurn[];
  /** Products whose photo was already sent in this chat. */
  shownImageProductIds: string[];
};

/** Earlier messages handed to the agent; older ones rarely change the next reply. */
export const HISTORY_LIMIT = 20;
const TURN_MAX_CHARS = 1000;

type StoredMessage = { authorType: string; body: string; metadata?: unknown };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** What the catalog tool did in a stored agent turn. */
function catalogSearch(meta: Record<string, unknown>): Pick<ConversationTurn, 'productIds' | 'browse'> {
  const tools = Array.isArray(meta.tools) ? meta.tools : [];
  for (const tool of tools) {
    const trace = asRecord(tool);
    if (trace.name !== 'search_catalog') continue;
    const data = asRecord(trace.data);
    const ids = Array.isArray(data.matchIds)
      ? data.matchIds.filter((id): id is string => typeof id === 'string')
      : [];
    return {
      ...(ids.length ? { productIds: ids } : {}),
      ...(data.browse === true
        ? { browse: { category: typeof data.browseCategory === 'string' ? data.browseCategory : null } }
        : {}),
    };
  }
  return {};
}

/** Order lines a stored agent turn left waiting for the delivery district. */
function pendingDelivery(meta: Record<string, unknown>): Pick<ConversationTurn, 'pendingDelivery'> {
  const tools = Array.isArray(meta.tools) ? meta.tools : [];
  for (const tool of tools) {
    const trace = asRecord(tool);
    if (trace.name !== 'quote_shipping') continue;
    const data = asRecord(trace.data);
    if (data.awaitingDelivery !== true || !Array.isArray(data.lines)) return {};
    const lines = data.lines.flatMap((item): PendingLine[] => {
      const line = asRecord(item);
      return typeof line.productId === 'string' && Number.isSafeInteger(line.quantity) && (line.quantity as number) > 0
        ? [{
            productId: line.productId,
            variantId: typeof line.variantId === 'string' ? line.variantId : null,
            quantity: line.quantity as number,
          }]
        : [];
    });
    return lines.length ? { pendingDelivery: { lines } } : {};
  }
  return {};
}

/** Builds the agent context from stored messages in chronological order. */
export function buildAgentContext(messages: StoredMessage[]): AgentContext {
  const history: ConversationTurn[] = [];
  const shown = new Set<string>();
  for (const message of messages) {
    const meta = asRecord(message.metadata);
    if (meta.kind === 'image') {
      if (typeof meta.productId === 'string') shown.add(meta.productId);
      continue;
    }
    const text = message.body.slice(0, TURN_MAX_CHARS);
    if (message.authorType === 'BUYER') {
      history.push({ role: 'buyer', text });
      continue;
    }
    history.push({ role: 'agent', text, ...catalogSearch(meta), ...pendingDelivery(meta) });
  }
  return { history: history.slice(-HISTORY_LIMIT), shownImageProductIds: [...shown] };
}

/** Products of the latest seller turn that worked with the catalog. */
export function lastRecommendedProductIds(history: ConversationTurn[]): string[] {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role === 'agent' && turn.productIds?.length) return turn.productIds;
  }
  return [];
}

/** Lines waiting for the delivery district, only while the latest seller turn is that question. */
export function awaitingDelivery(history: ConversationTurn[]): PendingLine[] {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role === 'agent') return turn.pendingDelivery?.lines ?? [];
  }
  return [];
}

/** The latest catalog browse of the chat, so "ver más" continues the same listing. */
export function lastBrowse(history: ConversationTurn[]): { category: string | null } | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role === 'agent' && turn.browse) return turn.browse;
  }
  return null;
}

/** Every product the seller already presented in the chat, so "ver más" never repeats one. */
export function allRecommendedProductIds(history: ConversationTurn[]): string[] {
  return [...new Set(history.flatMap((turn) => (turn.role === 'agent' ? (turn.productIds ?? []) : [])))];
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

const CLOSING_WORDS =
  /\b(gracias|grax|thanks|thank you|chau|chao|adios|hasta luego|hasta pronto|hasta manana|nos vemos|bye|bendiciones|cuidate)\b/g;
const ACK_WORDS =
  /\b(ok|okay|okey|oki|vale|listo|perfecto|genial|excelente|super|bueno|buenisimo|entendido|de acuerdo|dale|ya|claro|bien|muy|amable|muchas|muchisimas|mil|a ti|a usted|por todo|por la ayuda|por tu ayuda|por su ayuda|igualmente|entonces|saludos|que tengas|buen dia|buena tarde|buenas tardes|buenas noches|lindo dia|nada mas|eso es todo|es todo)\b/g;

/**
 * Short social messages that need a social answer instead of a sales pitch: a farewell
 * ("ok, gracias", "chau") or a bare acknowledgement ("listo", "perfecto"). Anything with
 * a question or extra words is a real message and returns null.
 */
export function conversationalIntent(text: string): 'closing' | 'acknowledgement' | null {
  if (text.includes('?')) return null;
  const normalized = normalizeText(text)
    .replace(/[\p{P}\p{S}\p{Extended_Pictographic}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return null;
  const closing = new RegExp(CLOSING_WORDS.source).test(normalized);
  const rest = normalized.replace(CLOSING_WORDS, ' ').replace(ACK_WORDS, ' ').trim();
  if (rest) return null;
  return closing ? 'closing' : 'acknowledgement';
}

export function wantsPhoto(text: string): boolean {
  return /\b(foto|fotos|fotito|imagen|imagenes|como se ve|ver como es)\b/.test(normalizeText(text));
}

/**
 * WhatsApp renders plain text with *bold* and _italic_: Markdown links, double asterisks
 * and headings show up as raw symbols, so they are rewritten before sending.
 */
export function toWhatsAppText(text: string): string {
  return text
    .replace(/!?\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label: string, url: string) =>
      label.trim() === url ? url : `${label.trim()}: ${url}`,
    )
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/__(.+?)__/g, '_$1_')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
