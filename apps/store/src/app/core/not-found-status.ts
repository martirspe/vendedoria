import { RESPONSE_INIT, inject } from '@angular/core';

/** Sets HTTP 404 on the SSR response; no-op in the browser. */
export function markNotFound(): void {
  const response = inject(RESPONSE_INIT, { optional: true });
  if (response) {
    response.status = 404;
  }
}
