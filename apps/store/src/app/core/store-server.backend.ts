import { Injectable, REQUEST_CONTEXT, inject } from '@angular/core';
import {
  FetchBackend,
  HttpBackend,
  HttpEvent,
  HttpRequest,
} from '@angular/common/http';
import { Observable } from 'rxjs';
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
    if (!this.context || !request.url.startsWith(STORE_PROXY_PREFIX)) {
      return this.fetchBackend.handle(request);
    }
    const url = this.context.apiBase + request.url.slice(STORE_PROXY_PREFIX.length);
    const headers = this.context.previewToken
      ? request.headers.set(PREVIEW_HEADER, this.context.previewToken)
      : request.headers;
    return this.fetchBackend.handle(request.clone({ url, headers }));
  }
}
