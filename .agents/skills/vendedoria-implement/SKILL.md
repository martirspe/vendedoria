---
name: vendedoria-implement
description: Workflow to implement a feature or fix a bug in VendedorIA (NestJS api, Angular console, tenant store, shared packages) with scoped exploration, constitution-section routing and per-surface verification. Use when asked to add, change or fix behavior ("implementa", "agrega", "arregla", "bug", new endpoint, new console page, store change). Not for pure reviews (vendedoria-review).
---

# VendedorIA — implement

## Use when
- Adding or changing behavior in `apps/api`, `apps/web`, `apps/store` or `packages/`.
- Fixing a bug with a known or suspected location.

Also load, only if the task touches them: `vendedoria-data` (schema/migrations), `vendedoria-security` (auth, webhooks, payments, Meta, public store API), `vendedoria-ui` (templates/styles/UX states).

## Inputs
- Task statement; files or module named by the user (start there, exclusively).
- Affected surfaces: api / web / store / packages.

## Procedure
1. Scope: list affected surfaces and domains. Use `docs/agent/context-map.md` to jump to paths instead of searching globally.
2. Read the nearest local `AGENTS.md` for each affected surface.
3. Read only the constitution section the task needs (table below). Find it with `rg -n "^#" "PROJECT CONSTITUTION.md"` and read that range.
4. Inspect an existing sibling implementation (same layer, neighbouring domain) and copy its pattern.
5. Small change: implement → verify. Multi-file or risky (money, chats, auth, schema, contracts): write a short plan of affected files and contracts first, then implement.
6. Make the minimal coherent change. Cross-surface features go API first (DTO + service + controller + Swagger), then contract (`packages/contracts` for store only), then UI.
7. Verify (below), update `CHANGELOG.md` `[Unreleased]` if product-relevant, stop.

For long work spanning sessions, keep a plan file under `docs/agent/plans/<topic>.md` and delete it when done. Never for trivial tasks.

## Constitution routing
| Task touches | Section (heading) |
| --- | --- |
| Any console module scope/wedge | `MAPA FUNCIONAL DE CONSOLA` → the module subsection |
| Product framing, "un paso más allá" | `Ventajas que VendedorIA debe ganar` |
| Required UX states, mobile parity | `MADUREZ DEL PRODUCTO`, `CALIDAD UX 2027` |
| Sales agent / AI runtime | `STACK TECNOLÓGICO` → `## IA` |
| Payments, orders, billing | `## Pagos (dominio de producto)` |
| WhatsApp/Instagram channels | `## Canales` |
| Catalog model | `## Catálogo (modelo de dominio)` |
| Marketing pages | `SEO`, `PERFORMANCE`, `IDENTIDAD VISUAL` |
| Events, logging | `OBSERVABILIDAD Y OPERACIÓN` |
| Scope doubts | `ANTI-ALCANCE (POST-PMV)` |

Where the constitution describes architecture that does not exist yet, follow the code (see `docs/agent/context-map.md` → Discrepancies).

## Minimal context
- API task: `apps/api/AGENTS.md`, `apps/api/src/<domain>/`, the DTO folder, `prisma/schema.prisma` models it uses. Do not open frontend apps unless the response shape consumed by them changes.
- Console task: `apps/web/AGENTS.md`, `apps/web/src/app/features/<feature>/`, its `core/api/<domain>-api.service.ts`. Open the API controller only to confirm a contract.
- Store task: `apps/store/AGENTS.md`, the feature folder, `packages/contracts/index.d.ts`.
- Expand beyond these only for an unresolved dependency.

## Verification
| Changed | Run |
| --- | --- |
| api | `npm run build:api`; focused: `docker compose -f docker-compose.dev.yml exec api npx jest <pattern>`; suite: `npm run test:docker` |
| web | `npm run build:web`; logic: `npm run test -w @vendedoria/web` |
| store | `npm run build:store` |
| packages/ui, design-tokens | `npm run build:web` + `npm run build:store` |
| packages/contracts | all three builds |
| schema | see `vendedoria-data` |

Run the global set (`npm run build` + `npm run test:docker`) only for cross-surface, config or build changes. If a command cannot run (e.g. Docker down), say so explicitly; do not claim it passed.

## Definition of Done
- Affected builds pass; relevant tests pass or the gap is stated.
- Tenant scoping, flow A/B separation and PII rules from root `AGENTS.md` hold.
- UI touched: loading/empty/error/success, Spanish copy, tokens only.
- New env vars documented in both `.env*.example` files with placeholders.
- `CHANGELOG.md` updated when product-relevant; summary names the improved wedge for product features.

## Avoid
- Repo-wide searches when the domain path is known.
- Reading the whole constitution, all skills or unrelated modules.
- Fixing pre-existing issues outside scope (report them instead).
- New dependencies, abstractions or layers not required by the task.
