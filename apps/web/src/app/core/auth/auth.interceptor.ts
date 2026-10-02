import {
  HttpContextToken,
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthApiService } from './auth-api.service';

/** Marks a request that already went through one refresh+retry cycle. */
export const AUTH_RETRIED = new HttpContextToken(() => false);

function isAuthUrl(url: string): boolean {
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/register') ||
    url.includes('/auth/refresh')
  );
}

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const auth = inject(AuthApiService);
  const router = inject(Router);
  const skipAuthHeader = isAuthUrl(req.url);
  const token = skipAuthHeader ? null : auth.getAccessToken();

  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        skipAuthHeader
      ) {
        return throwError(() => error);
      }

      // Already retried once after refresh — real auth failure.
      if (req.context.get(AUTH_RETRIED)) {
        auth.logout();
        void router.navigateByUrl('/auth/login');
        return throwError(() => error);
      }

      return from(auth.refreshSession()).pipe(
        // Only logout when refresh itself fails — not when the retried
        // business request fails (e.g. playground 500).
        catchError((refreshError) => {
          auth.logout();
          void router.navigateByUrl('/auth/login');
          return throwError(() => refreshError);
        }),
        switchMap(() => {
          const nextToken = auth.getAccessToken();
          return next(
            req.clone({
              context: req.context.set(AUTH_RETRIED, true),
              setHeaders: nextToken
                ? { Authorization: `Bearer ${nextToken}` }
                : {},
            }),
          );
        }),
      );
    }),
  );
};
