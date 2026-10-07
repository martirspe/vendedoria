# apps/store — Public tenant store (Angular SSR)

Global rules live in the root `AGENTS.md`. Angular conventions are the same as `apps/web/AGENTS.md` → "Angular conventions". UI work: `vendedoria-ui` skill.

## How it works
- Every route renders per request (`RenderMode.Server`); nothing is prerendered because content depends on the host.
- `src/server.ts` (Express) resolves host → tenant slug through `GET /api/v1/storefront/resolve`, returns 404/503 status pages, sets security headers/CSP, serves `robots.txt`/`sitemap.xml`, and proxies browser calls under `STORE_PROXY_PREFIX` to the API.
- The browser never chooses the tenant: the slug always comes from the host on the server. Keep the proxy GET-only and allow-listed (`PROXY_PATH`).
- Preview of unpublished stores uses a signed token (`?preview=` → httpOnly cookie → `x-store-preview` header). Never weaken token validation.
- Data access: `core/store-api.service.ts`, state in `core/store-state.service.ts`, request context in `core/store-context.ts`, cart in `core/cart.service.ts` (client-side), SEO in `core/seo.service.ts`.
- API payload types come only from `packages/contracts`; do not redeclare them locally.

## Templates
- `StorefrontView.template` picks the storefront. `classic` is `features/*`; every other template lives in `src/app/templates/<name>/` with its own `<name>.routes.ts`, mounted in `app.routes.ts` before the classic routes with `canMatch: [templateMatch('<name>')]`. Keep the same URLs as classic so sitemaps, emails and agent links work in every template.
- Templates reuse core services (`StoreState`, `CartService`, `StoreApiService`, SEO) and may extend classic pages for logic (order, legal); checkout and pricing truth stays on the server.
- `selecta/` (industry `belleza`) is a faithful port of the Selecta store: its global CSS is scoped under `body.tpl-selecta` (class set by the shell) in `templates/selecta/selecta.scss`, built as the non-injected `selecta.css` bundle (`angular.json` → `styles`) that only the shell links, and the classic globals sit in `@layer store-base` (`src/_store-base.scss`) so template styles always win. Texts come from `templateContent` with Selecta defaults in `selecta-copy.ts`.
- Visual editor: the console frames the store with `?editor=<previewToken>` (`server.ts` sets `frame-ancestors` to `STORE_EDITOR_ORIGIN` only for that request). Editable texts, images and sections use the `STORE_EDITOR` directives in `core/store-editor.ts` (`storeEditText`, `storeEditImage`, `storeSection`) with keys `section.field` that must exist in `TEMPLATE_SECTIONS` (`apps/api/src/storefront/store-templates.ts`); a missing value means the template default and `''` hides the element.
- Home sections render in a `@for` + `@switch` over `homeSections()` (`core/store-layout.ts`), which applies the template's saved layout (order, hidden, library blocks with ids `type-xxxxxx`) or the default order. A new built-in section or library block needs a `case` in every template's home, an entry in `TEMPLATE_SECTIONS` and, for blocks, `HOME_BLOCKS`. Blocks that look the same in every template (`benefits`, `testimonials`, `whatsapp`, `gallery`, `cta`, `questions`) render through `components/home-block.component.ts` in the `@default` branch (`sharedBlockType`), styled only with `--store-*`; Selecta maps its palette onto `--store-*` on `selecta-shell`. Fixed sections outside the home (`announcement` in every shell, `product` on every product page, Selecta `footer`) read their texts through `core/page-copy.ts`; a section with `page` in the API schema makes the editor bridge open that page (`openPage`) when the merchant selects it.

## Theming
- Theme identities/releases and renderer controls are in `packages/themes/`; see `docs/THEMES.md`. `themeRelease.renderer` selects the compiled platform presentation independently from merchant slug. `storeHomeSections()` applies merchant composition or the pinned release default; safe mode uses the recovery composition without rewriting merchant data.
- Base tokens live in `packages/design-tokens/`; `core/theme.ts` merges release defaults below merchant overrides, including explicit empty values. Shells and `core/theme-tokens.directive.ts` apply bounded semantic `--store-*`/`--ds-*` variables and renderer adapters. Options are pinned manifest `settings`; do not add arbitrary CSS, URLs or executable sources.
- This is a buyer-facing surface: no console patterns, no auth, no JWT code.

## Verify
- `npm run build:store`, `npm run theme:test:store` (pure Node runtime contract tests), and `npm run test -w @vendedoria/store -- --watch=false` (Angular/Vitest cart and purchase regressions); all covered by CI.
- Manual: `http://{slug}.localhost:4300` with the dev stack up.
