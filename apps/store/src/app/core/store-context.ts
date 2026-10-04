/** Same-origin path the store server proxies to `/storefront/{slug}` of the API. */
export const STORE_PROXY_PREFIX = '/_api';

export const PREVIEW_HEADER = 'x-store-preview';

/** Cloudflare Turnstile token of the checkout; the proxy forwards it only on POST. */
export const TURNSTILE_HEADER = 'x-turnstile-token';

/** Passed by `server.ts` to every SSR render through `REQUEST_CONTEXT`. */
export type StoreRequestContext = {
  /** Absolute API URL of this tenant store, e.g. `http://api:3000/api/v1/storefront/acme`. */
  apiBase: string;
  previewToken: string | null;
  /** Public origin of the request, e.g. `https://acme.tiendas.example.pe`. */
  origin: string;
  /** Console origin allowed to drive the visual editor; set only for signed editor requests. */
  editorOrigin: string | null;
};
