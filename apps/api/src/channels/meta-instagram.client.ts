import { Injectable, Logger } from '@nestjs/common';

/** Instagram API with Instagram Login (professional accounts). */
const GRAPH_BASE = 'https://graph.instagram.com/v21.0';
/** Instagram rejects text messages longer than 1 000 characters. */
const MAX_TEXT = 1000;

export type InstagramChannelMetadata = {
  accessToken: string;
  accountId: string;
  username?: string;
};

export function asInstagramMetadata(metadata: unknown): InstagramChannelMetadata | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = metadata as Record<string, unknown>;
  if (typeof value.accessToken !== 'string' || typeof value.accountId !== 'string') return null;
  return {
    accessToken: value.accessToken,
    accountId: value.accountId,
    username: typeof value.username === 'string' ? value.username : undefined,
  };
}

export function isPlaceholderToken(token: string): boolean {
  return token.length < 20 || /placeholder|replace|demo|test/i.test(token);
}

/** Splits a reply at line or word boundaries so every part fits Instagram's limit. */
export function splitInstagramText(text: string): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > MAX_TEXT) {
    const window = rest.slice(0, MAX_TEXT);
    const cut = Math.max(window.lastIndexOf('\n'), window.lastIndexOf(' '));
    const at = cut > MAX_TEXT / 2 ? cut : MAX_TEXT;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

@Injectable()
export class MetaInstagramClient {
  private readonly logger = new Logger(MetaInstagramClient.name);

  /** Account behind a token: `user_id` is the id Instagram sends in webhooks. */
  async fetchAccount(
    accessToken: string,
  ): Promise<{ ok: true; accountId: string; username: string | null } | { ok: false; error: string }> {
    try {
      const response = await fetch(`${GRAPH_BASE}/me?fields=user_id,username`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });
      const payload = (await response.json()) as {
        user_id?: string | number;
        username?: string;
        error?: { message?: string };
      };
      if (!response.ok || payload.user_id === undefined) {
        return { ok: false, error: payload.error?.message ?? `HTTP ${response.status}` };
      }
      return { ok: true, accountId: String(payload.user_id), username: payload.username ?? null };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'unknown' };
    }
  }

  async sendTextMessage(params: {
    accountId: string;
    accessToken: string;
    recipientId: string;
    text: string;
  }): Promise<{ messageId?: string; ok: boolean; error?: string; dryRun?: boolean }> {
    if (isPlaceholderToken(params.accessToken)) {
      return { ok: true, dryRun: true, messageId: `ig_local_${Date.now()}` };
    }
    let messageId: string | undefined;
    for (const part of splitInstagramText(params.text)) {
      try {
        const response = await fetch(`${GRAPH_BASE}/${params.accountId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${params.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ recipient: { id: params.recipientId }, message: { text: part } }),
          signal: AbortSignal.timeout(15_000),
        });
        const payload = (await response.json()) as { message_id?: string; error?: { message?: string } };
        if (!response.ok) {
          const error = payload.error?.message ?? `HTTP ${response.status}`;
          this.logger.warn(`Instagram send failed: ${error}`);
          return { ok: false, error, messageId };
        }
        messageId = payload.message_id ?? messageId;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        this.logger.warn(`Instagram send exception: ${message}`);
        return { ok: false, error: message, messageId };
      }
    }
    return { ok: true, messageId };
  }
}
