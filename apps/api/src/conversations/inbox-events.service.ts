import { Injectable, MessageEvent } from '@nestjs/common';
import { filter, interval, map, merge, Observable, of, Subject } from 'rxjs';

export type InboxEventKind = 'message' | 'conversation';

type InboxEvent = { tenantId: string; conversationId: string; kind: InboxEventKind };

/** Below the 60 s proxy_read_timeout of both nginx layers, so idle streams stay open. */
const HEARTBEAT_MS = 25_000;

/**
 * Per-tenant inbox change notifications for the console (Server-Sent Events). Events carry
 * only ids: the console refetches through the regular tenant-scoped endpoints, so no chat
 * content or PII travels on the stream. In-process fan-out: valid while the API runs as a
 * single instance; several instances would need a shared bus (e.g. Postgres NOTIFY).
 */
@Injectable()
export class InboxEventsService {
  private readonly events = new Subject<InboxEvent>();

  publish(tenantId: string, conversationId: string, kind: InboxEventKind = 'message'): void {
    this.events.next({ tenantId, conversationId, kind });
  }

  stream(tenantId: string): Observable<MessageEvent> {
    const updates = this.events.pipe(
      filter((event) => event.tenantId === tenantId),
      map(({ conversationId, kind }): MessageEvent => ({ type: 'inbox', data: { conversationId, kind } })),
    );
    const heartbeat = interval(HEARTBEAT_MS).pipe(map((): MessageEvent => ({ type: 'ping', data: {} })));
    return merge(of<MessageEvent>({ type: 'ready', data: {} }), updates, heartbeat);
  }
}
