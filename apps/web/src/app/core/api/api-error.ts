import { HttpErrorResponse } from '@angular/common/http';

/** API message for expected client errors (validation, plan, permissions); otherwise the fallback. */
export function messageFrom(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500 && error.status !== 401) {
    const message = error.error?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  }
  return fallback;
}
