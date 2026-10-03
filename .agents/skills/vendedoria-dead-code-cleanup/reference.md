# Dead-code cleanup — reference

## Detection (no new dependencies)

Run from the repo root (inside the dev stack when `node_modules` is not on the host: `docker compose -f docker-compose.dev.yml run --rm --no-deps deps sh -c "<command>"`).

| Goal | Command / search |
| --- | --- |
| Unused locals/params (signal, not proof) | `npx tsc --noEmit --noUnusedLocals --noUnusedParameters -p apps/api/tsconfig.json` (same for `apps/web/tsconfig.app.json`, `apps/store/tsconfig.app.json`) |
| Who imports a symbol | `rg -n "\bSymbolName\b" apps packages --glob '!**/dist/**'` (exclude the defining file) |
| Component used? | `rg -n "<selector-name|SymbolComponent" apps packages` |
| Page routed? | `rg -n "loadComponent|loadChildren|component:" apps/web/src/app/app.routes.ts apps/store/src/app` |
| Nest provider wired? | `rg -n "SymbolService" apps/api/src --glob '*.module.ts'` |
| Endpoint called? | path string in `apps/web/src/app/core/api`, `apps/store/src/app/core/store-api.service.ts`, `apps/store/src/server.ts` (`PROXY_GET/POST`), README, tests |
| Env var live? | `rg -n "VAR_NAME" apps/api/src/config/env.validation.ts .env.example .env.production.example docker-compose*.yml apps` |
| SCSS class used? | `rg -n "class-name" apps/<app>/src --glob '*.html' --glob '*.ts'` (watch `[class.x]` and `ngClass` bindings) |
| Dependency used? | `rg -n "from '<pkg>|require\('<pkg>|<pkg>" apps packages scripts *.json --glob '!package-lock.json'` |

Dynamic usage to rule out before deleting: string-based maps (`DS_ICONS`, template registries in `apps/store/src/app/templates`, `templateMatch('<name>')`), Prisma `include/select` keys, JSON columns read by key, CLI entries in `package.json` scripts, Dockerfile `COPY`/`CMD`.

## Protect list (needs explicit approval)

- Auth: `JwtAuthGuard` global guard, `@Public()` decorator, refresh tokens, `RateLimit` buckets.
- Webhooks: Meta WhatsApp (`channels`), Mercado Pago (`payments`, `checkout`), signature helpers — even if quiet locally.
- Money: `payment-provider.port.ts`, `MockPaymentProvider` (used when credentials are empty; removal is a product decision), idempotency keys, stock reservation/restore in `orders/stock.ts`.
- Store: `apps/store/src/server.ts` host resolution, preview-token flow, proxy allow-lists, sitemap/robots, legacy Selecta URL redirects.
- Contracts: `packages/contracts/index.d.ts` and `storefront-mapper.ts` fields (the store or the agent may read them).
- Legacy input still accepted by the API (e.g. `mediaUrls` next to `media` in catalog DTOs): remove only after confirming no client sends it, and note it as an API change.
- Data: applied migrations (including the intentional no-op `0004_sales_agent_personality_fields`), seed scripts used by docs/README (`apps/api/scripts/seed-selecta-catalog.mjs`), `ubigeo` data and `scripts/compile-ubigeos.mjs`.
- Tests: `test/storefront-isolation.e2e-spec.ts` and any spec covering signatures, isolation or idempotency.

## Not dead code

- Dev-only branches correctly gated (`NODE_ENV === 'development'`, store/web server dev-only middleware when not the standalone server, `ng serve` loopback redirects).
- Deterministic fallback of the sales agent when `OPENAI_API_KEY` is empty.
- Email preview mode (`EMAIL_MODE=preview`) used in development.
- Defensive checks that duplicate a DB constraint (they give better errors).

## Typical legacy areas in this repo

- Console pages/components superseded by newer pages (e.g. generic placeholder pages no longer routed).
- Old store features kept after a template replaced them: classic `features/*` is still the default template, so it is **not** legacy.
- Leftovers of replaced libraries (icon sets, UI kits) in `package.json`, styles or docs.
- Docs in `docs/plans/` and `docs/plan-tienda-web.md`: proposals, code wins; update or mark obsolete sections, do not delete without asking.

## Safe-delete checklist per file

1. Zero static and dynamic references (above).
2. Not on the protect list.
3. Builds of every workspace that could import it pass after deletion.
4. Docs/skills no longer mention it.
