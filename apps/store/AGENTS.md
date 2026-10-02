# apps/store — Public tenant store (Angular SSR)

Global rules live in the root `AGENTS.md`. Angular conventions are the same as `apps/web/AGENTS.md` → "Angular conventions". UI work: `vendedoria-ui` skill.

## How it works
- Every route renders per request (`RenderMode.Server`); nothing is prerendered because content depends on the host.
- `src/server.ts` (Express) resolves host → tenant slug through `GET /api/v1/storefront/resolve`, returns 404/503 status pages, sets security headers/CSP, serves `robots.txt`/`sitemap.xml`, and proxies browser calls under `STORE_PROXY_PREFIX` to the API.
- The browser never chooses the tenant: the slug always comes from the host on the server. Keep the proxy GET-only and allow-listed (`PROXY_PATH`).
- Preview of unpublished stores uses a signed token (`?preview=` → httpOnly cookie → `x-store-preview` header). Never weaken token validation.
- Data access: `core/store-api.service.ts`, state in `core/store-state.service.ts`, request context in `core/store-context.ts`, cart in `core/cart.service.ts` (client-side), SEO in `core/seo.service.ts`.
- API payload types come only from `packages/contracts`; do not redeclare them locally.

## Theming
- Base tokens from `packages/design-tokens/tokens.scss`, store tokens (`--store-*`) from `packages/design-tokens/storefront.scss`, per-tenant overrides applied by `core/theme.ts`. Features use `--store-*`/`--ds-*` variables, never literal colors.
- This is a buyer-facing surface: no console patterns, no auth, no JWT code.

## Verify
- `npm run build:store` (not covered by CI). No unit test runner is configured for this app.
- Manual: `http://{slug}.localhost:4300` with the dev stack up.
