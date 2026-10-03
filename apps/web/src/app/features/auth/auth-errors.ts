import { HttpErrorResponse } from '@angular/common/http';

export const CHALLENGE_PENDING = 'Completa la verificación de seguridad para continuar.';

/** Messages shared by login and sign-up for connectivity, rate limits and the Turnstile check. */
export function authErrorMessage(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) return null;
  if (error.status === 0) return 'No pudimos conectar con VendedorIA. Revisa tu conexión e inténtalo de nuevo.';
  if (error.status === 429) return 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.';
  if (error.status === 403 || error.status === 503) {
    const message: unknown = error.error?.message;
    return typeof message === 'string' ? message : 'No pudimos verificar que eres una persona. Vuelve a intentarlo.';
  }
  return null;
}
