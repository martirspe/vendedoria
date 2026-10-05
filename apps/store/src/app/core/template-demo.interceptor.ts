import { inject } from "@angular/core";
import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpResponse,
} from "@angular/common/http";
import { from, map, throwError } from "rxjs";
import { STORE_PROXY_PREFIX } from "./store-context";
import { TemplateDemo } from "./template-demo";

/** Demos never send catalog, personal data or purchase requests to the tenant API. */
export const templateDemoInterceptor: HttpInterceptorFn = (request, next) => {
  const demo = inject(TemplateDemo);
  if (!demo.template) return next(request);
  const origin = demo.origin;
  const url = new URL(request.url, origin);
  if (
    url.origin !== origin ||
    !(
      url.pathname === STORE_PROXY_PREFIX ||
      url.pathname.startsWith(STORE_PROXY_PREFIX + "/")
    )
  ) {
    return next(request);
  }
  if (request.method !== "GET")
    return throwError(
      () =>
        new HttpErrorResponse({
          status: 405,
          error: {
            message:
              "Esta es una vista previa. No se realizan pedidos ni cobros.",
          },
        }),
    );
  const template = demo.template;
  return from(
    import("../demos/template-demo-data").then(({ demoResponse }) =>
      demoResponse(
        template,
        url.pathname.slice(STORE_PROXY_PREFIX.length),
        url.searchParams,
      ),
    ),
  ).pipe(
    map((body) => {
      if (body === null) throw new HttpErrorResponse({ status: 404 });
      return new HttpResponse({ status: 200, body });
    }),
  );
};
