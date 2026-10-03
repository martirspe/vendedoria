import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { EMPTY, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthApiService } from '../auth/auth-api.service';

export type InboxStreamEvent =
  | { kind: 'message' | 'conversation'; conversationId: string }
  /** The stream came back after a drop: events may have been missed, refetch. */
  | { kind: 'reconnected' };

const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;

/** Parses one Server-Sent Events block; only `inbox` events matter to the console. */
export function parseInboxEvent(block: string): InboxStreamEvent | null {
  let type = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) type = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }
  if (type !== 'inbox' || !data.length) return null;
  try {
    const payload = JSON.parse(data.join('\n')) as { conversationId?: unknown; kind?: unknown };
    if (typeof payload.conversationId !== 'string') return null;
    return {
      kind: payload.kind === 'conversation' ? 'conversation' : 'message',
      conversationId: payload.conversationId,
    };
  } catch {
    return null;
  }
}

/**
 * Live inbox changes from `GET /conversations/stream`. Uses fetch instead of EventSource
 * because the API authenticates with a Bearer header; refreshes the session once on 401
 * and reconnects with jittered backoff while subscribed.
 */
@Injectable({ providedIn: 'root' })
export class InboxStreamService {
  private readonly auth = inject(AuthApiService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  events(): Observable<InboxStreamEvent> {
    if (!this.isBrowser) return EMPTY;
    return new Observable<InboxStreamEvent>((subscriber) => {
      let controller: AbortController | null = null;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let attempt = 0;
      let closed = false;
      let connectedOnce = false;

      const retry = () => {
        if (closed) return;
        const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempt);
        attempt += 1;
        timer = setTimeout(() => void connect(), delay * (0.5 + Math.random() / 2));
      };

      const connect = async () => {
        controller = new AbortController();
        try {
          let response = await this.open(controller.signal);
          if (response.status === 401) {
            await this.auth.refreshSession();
            response = await this.open(controller.signal);
          }
          if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
          if (connectedOnce) subscriber.next({ kind: 'reconnected' });
          connectedOnce = true;
          attempt = 0;
          await this.read(response.body, (event) => subscriber.next(event));
        } catch {
          // Dropped, unauthorized or offline: retried below while still subscribed.
        }
        retry();
      };

      void connect();
      return () => {
        closed = true;
        clearTimeout(timer);
        controller?.abort();
      };
    });
  }

  private open(signal: AbortSignal): Promise<Response> {
    const token = this.auth.getAccessToken();
    return fetch(`${environment.apiBaseUrl}/conversations/stream`, {
      headers: {
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: 'no-store',
      signal,
    });
  }

  private async read(
    body: ReadableStream<Uint8Array>,
    emit: (event: InboxStreamEvent) => void,
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const event = parseInboxEvent(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (event) emit(event);
        boundary = buffer.indexOf('\n\n');
      }
    }
  }
}
