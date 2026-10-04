import { Injectable, REQUEST_CONTEXT, inject } from '@angular/core';
import {
  FetchBackend,
  HttpBackend,
  HttpEvent,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable, map } from 'rxjs';
import {
  PREVIEW_HEADER,
  STORE_PROXY_PREFIX,
  StoreRequestContext,
} from './store-context';

/**
 * Server-only backend: sends proxy URLs straight to the API. It runs after the
 * HTTP transfer cache, so cache keys stay identical to the browser requests.
 */
@Injectable()
export class StoreServerBackend implements HttpBackend {
  private readonly fetchBackend = inject(FetchBackend);
  private readonly context = inject(REQUEST_CONTEXT, {
    optional: true,
  }) as StoreRequestContext | null;

  handle(request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
    const path = this.context ? this.proxyPath(request.url, this.context.origin) : null;
    if (!this.context || path === null) {
      return this.fetchBackend.handle(request);
    }
    const url = this.context.apiBase + path.slice(STORE_PROXY_PREFIX.length);
    if (!this.context.previewToken) {
      return this.fetchBackend.handle(request.clone({ url }));
    }
    const headers = request.headers.set(PREVIEW_HEADER, this.context.previewToken);
    // Preview payloads are `no-store`, which the transfer cache skips; the browser would then refetch
    // without the token (the editor iframe has no cookie). The page itself is sent `private, no-store`.
    return this.fetchBackend
      .handle(request.clone({ url, headers }))
      .pipe(
        map((event) =>
          event instanceof HttpResponse
            ? event.clone({ headers: event.headers.delete('Cache-Control') })
            : event,
        ),
      );
  }

  /** platform-server turns relative URLs into absolute ones on the request origin. */
  private proxyPath(url: string, origin: string): string | null {
    const base = new URL(origin);
    const target = new URL(url, base);
    if (target.host !== base.host) return null;
    const path = target.pathname;
    return path === STORE_PROXY_PREFIX || path.startsWith(`${STORE_PROXY_PREFIX}/`)
      ? path + target.search
      : null;
  }
}
