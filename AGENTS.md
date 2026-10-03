# VendedorIA

Multi-tenant SaaS: AI sales agents on WhatsApp/Instagram ("del hola al pago") plus a public web store per tenant. Brownfield npm-workspaces monorepo, Node >= 22, Docker-first development.

## Authority
1. Executable code > tests > config/CI/Docker > the user's instructions for the task.
2. `PROJECT CONSTITUTION.md` is the product/UX authority (~750 lines). Never read it whole: open only the heading the task needs (routing table in `.agents/skills/vendedoria-implement/SKILL.md`).
3. Then this file, the nearest local `AGENTS.md`, then skills. Chat is never a source of truth.
4. Code vs docs conflict: follow verifiable code, add one line to `docs/agent/context-map.md` → Discrepancies; ask only if the choice irreversibly changes product behavior.

## Repository map
- `apps/api` NestJS 11 + Fastify + Prisma 6 + PostgreSQL (`/api/v1`, Swagger `/docs`) → `apps/api/AGENTS.md`
- `apps/web` Angular 22 console + marketing (prerendered SSR) → `apps/web/AGENTS.md`
- `apps/store` Angular 22 tenant store, SSR per request resolved by host → `apps/store/AGENTS.md`
- `packages/ui`, `packages/design-tokens`, `packages/contracts` → `packages/AGENTS.md`
- Domain → paths index: `docs/agent/context-map.md`

## Global invariants
- Code, identifiers, comments, DB, endpoints in English; user-visible copy in Spanish.
- Tenant isolation: tenant-owned data is always scoped by a `tenantId` taken from the authenticated user or the store host, never from client input.
- Money flow A (tenant pays SaaS plan) and flow B (buyer pays an order) stay separate in domain, API and copy. Amounts are integer cents.
- Never read, print or commit secrets (`.env*` except `*.example`, Meta tokens, payment credentials). Chats, phones and emails are PII: never log them.
- The sales agent never invents price, stock or shipping; an operator's manual message pauses the agent in that conversation.
- No naming, copy or UI copied from competitors.
- Minimal coherent change: no unrelated refactors, renames, mass formatting, new dependencies or speculative abstractions.

## Work routing
- Load the least context: task → nearest `AGENTS.md` → one skill → affected files → direct dependencies. Expand only when evidence is missing; no repo-wide exploration by default.
- Feature or bug fix: `.agents/skills/vendedoria-implement`
- Prisma schema, migrations, tenant-scoped queries, test DB: `vendedoria-data`
- Auth, webhooks, payments, Meta channel, public store endpoints: `vendedoria-security`
- Console/store UI, design system, UX states: `vendedoria-ui`
- S3/CloudFront media, SES email, AWS IAM, deliverability and Terraform (`infra/terraform/`): `vendedoria-aws`
- Reviewing a diff or PR: `vendedoria-review`
- Full release pass (cleanup + security + copy + prod config): `vendedoria-production-readiness`, which runs `vendedoria-dead-code-cleanup`, `vendedoria-security-audit` and `vendedoria-copy-audit` (each also usable alone)
- Docker/deploy: `docker-compose*.yml`, `Dockerfile`, `docker/nginx/`, `scripts/docker.mjs`, `scripts/deploy.sh`, `docs/DEPLOY.md`.

## Canonical commands (repo root)
- `npm run dev` · `npm run docker:logs` · `npm run docker:down` (dev stack with hot reload)
- `npm run test:docker` (api unit + e2e on isolated `vendedoria_test`; dev stack must be up)
- `npm run build:api` · `npm run build:web` · `npm run build:store`
- `npm run lint` (api eslint with `--fix` + web dev build; it rewrites files)
- `npm run prisma:generate`

## Verification
- Build every affected app and run the narrowest relevant test first. Run everything only for cross-surface, contract, config or build changes.
- CI (`.github/workflows/ci.yml`) only runs prisma generate + build api + build web: verify store and tests locally when touched.
- Product-relevant changes get an entry in `CHANGELOG.md` → `[Unreleased]`.

## Documentation
- Product/UX authority: `PROJECT CONSTITUTION.md` (read by section)
- Store integration plan (proposal; code wins): `docs/plan-tienda-web.md`
- Ports, setup: `README.md` · Production deploy (automatic and manual): `docs/DEPLOY.md` · AWS infrastructure with Terraform: `docs/TERRAFORM.md`
