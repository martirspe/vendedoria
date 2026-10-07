# VendedorIA — Shopify parity implementation report

Assessment date: 2026-10-07. Scope: local repository and Docker development stack. This is an evidence-backed implementation pass, not certification of complete Shopify parity or production readiness.

## A. Executive Summary

Implemented two concrete improvements: business JWT authorization now resolves current membership on each request; storefront purchase buttons add to the existing bag and await persistence before navigating to checkout. Removed memberships lose access immediately and downgraded roles no longer retain permissions from old tokens.

Patched Fastify, proxy-addr and Swagger's js-yaml dependency chain. Production dependency audit fell from 8 findings (1 critical, 4 high, 3 moderate) to 3 high findings from the remaining deepmerge-ts/Prisma chain. Added API and storefront unit tests to CI, using reproducible `npm ci` installation.

Final Docker API verification: 359 unit tests and 108 database/API E2E tests passed. Storefront: 4 new regression tests passed. Existing console and theme suites also passed. Full parity remains unverified across substantial product and provider scope.

## B. Stack Detected

- npm workspaces: NestJS 11/Fastify API, Prisma 6/PostgreSQL, Angular 22 console and server-rendered tenant storefront.
- Shared contracts, design tokens/UI and declarative theme packages; compiled platform renderers.
- Docker development services: API, web, store, PostgreSQL, Redis and Qdrant. API/web/store/PostgreSQL/Redis reported healthy; Qdrant running.
- Host Node 26.7.0; Docker Node 24.21.0. CI remains Node 22.
- Mercado Pago buyer payments, Meta channels and configurable media/email providers are represented in code; live provider operation was not exercised.

## C. Architecture

API modules use controller → service → Prisma. Tenant context comes from authenticated membership or storefront host resolution. SaaS billing and buyer payments are separate domains. Storefront carts are browser storage scoped to a store; LIVE/direct selections can use route-scoped checkout contexts. AI has durable conversation state and authoritative tools, but this does not establish one shared cross-channel cart/customer identity.

Changes preserve these boundaries. JWT requests now incur one indexed membership lookup; database failure does not grant access. Theme renderers reuse the cart service without putting commerce authority into theme packages. No schema redesign or new commerce abstraction was introduced.

## D. Shopify Parity

Statuses describe the assessed functionality, not percentage scores. No numeric score is assigned without an enumerated and verified denominator. PARTIAL PARITY means working comparable capabilities have evidence while gaps remain; NOT VERIFIED means the comparison has insufficient evidence.

| Area | Status | Implemented / evidence | Remaining |
| --- | --- | --- | --- |
| Admin | PARTIAL PARITY | Console build and 77 tests; team role changes exercised through API | Browser coverage of all admin actions, route permissions, global resource search |
| Commerce | PARTIAL PARITY | Shared order/payment services, 108 API E2E suite; corrected Buy Now bag semantics | Cross-channel customer/cart continuity and provider completion |
| Products | PARTIAL PARITY | Catalog, variants, sets, stockless products, import and 10,000-product search tests | Full CRUD/bulk workflows through admin UI and exhaustive combinations |
| Orders | PARTIAL PARITY | Order/checkout/settlement regression suites pass | Real provider payments/refunds and complete fulfillment lifecycle |
| Customers | NOT VERIFIED | Order contacts and sales customer memory exist | Dedicated customer lifecycle, consent, merge and cross-channel identity comparison |
| Themes | PARTIAL PARITY | Six sealed releases valid; 11 package tests and 5 store runtime tests pass | Independent renderer extensibility; third-party package admission workflow |
| Editor | PARTIAL PARITY | Lifecycle, versions and AI editor E2E suites pass | End-to-end browser editing/publish/rollback for every theme and viewport |
| Storefront | PARTIAL PARITY | Classic bag persistence, Selecta home purchase and Stride variant checkout observed | All page states, accessibility audit, SEO and visual regression coverage |
| Channels | NOT VERIFIED | Local adapter/integration tests pass | Real Meta delivery, retries, provider permissions and failures |
| AI | PARTIAL PARITY | Sales-engine unit/E2E tests pass | Model-backed quality evaluation and live multi-turn channel scenarios |
| Analytics | NOT VERIFIED | Metrics and conversion modules present | Event completeness, attribution correctness and report reconciliation |
| Security | PARTIAL PARITY | Live membership enforcement, tenant isolation suites, dependency patches | Residual advisory, full role/endpoint matrix and production deployment controls |
| Extensibility | PARTIAL PARITY | Theme ABI/release/schema checks pass | External apps, sandboxed extensions and independently authored renderers |

Comparison references: [Shopify theme architecture](https://shopify.dev/docs/storefronts/themes/architecture), [theme templates, sections and blocks](https://shopify.dev/docs/storefronts/themes/best-practices/templates-sections-blocks), and [user roles](https://help.shopify.com/en/manual/your-account/users/roles). No authenticated Shopify Admin was available or tested; these documents are architectural references only.

## E. Security

| Finding | Change | Evidence / residual |
| --- | --- | --- |
| P0: old business access token retained membership/role claims after removal or downgrade | Resolve current tenant/user membership and role on every authenticated request | AUTH-001–005 and TENANT-001; actual database/API downgrade and removal test passes |
| Vulnerable HTTP dependency chain | Fastify 5.12.5, proxy-addr 2.0.8 in lockfile | Patched Fastify confirmed inside running container; full API suites pass |
| Vulnerable Swagger YAML dependency | js-yaml 5.4.1 override | Installed version confirmed inside container |
| Residual dependency findings | No unverified major-version override applied | Audit still reports 3 high findings: deepmerge-ts and dependent Prisma packages |

Advisories: [Fastify](https://github.com/advisories/GHSA-p68q-wchp-6fh7), [proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [deepmerge-ts](https://github.com/advisories/GHSA-ggr8-5vv4-36mx). The deepmerge-ts v8 fix changes default Map merge behavior; review Prisma configuration compatibility before adopting it. The inspected consumer is Prisma configuration loading, not a demonstrated public request path; that observation does not prove absence of exploitability.

No credentials, secrets or real customer contacts were read into this report. No production deployment or live financial transaction was performed.

## F. Multi-Tenant

Existing storefront-isolation, conversion-isolation, platform-operator, LIVE and theme lifecycle suites passed against the isolated test database. New TENANT-001 verifies that JWT validation does not fall back to a membership in a different tenant. AUTH-005 proves revocation and role enforcement with an already-issued token.

Fixtures now create real database memberships for signed users. They no longer rely on nonexistent users or forged role claims to simulate permissions. This is evidence for these tested paths, not an exhaustive IDOR audit of every endpoint.

## G. UX/UI

Classic and Stride product purchase buttons, Selecta product buttons (including sticky mobile action), and Selecta home direct-buy actions now await cart mutation before checkout navigation. Buying state prevents repeated Buy Now clicks while navigation is pending. The Selecta FAQ matches the new behavior. The demo payment shortcut also awaits cart persistence.

Browser observations on local template previews:

| ID | Scenario | Result |
| --- | --- | --- |
| BROWSER-001 | Classic: bag contains Bolso A; Comprar ahora on perfume B | Checkout contains A + B, one each; total S/ 168.00 |
| BROWSER-002 | Reload the Classic checkout | Both lines and total remain |
| BROWSER-003 | Selecta: perfume in bag; home Comprar ahora for lotion | Checkout contains both products; total S/ 158.00 |
| BROWSER-004 | Stride: select shirt size M and Comprar ahora under mobile viewport override | Checkout shows one Camisa de algodón · M, S/ 119.00 |

Selecta mobile DOM showed no horizontal overflow (document width 398 vs observed viewport 414). Screenshot capture was unavailable; this is functional DOM/accessibility evidence, not a completed visual or accessibility audit. Preview orders/payments are disabled; no real order was submitted.

## H. Commerce

Products/variants: existing catalog E2E tests pass. A stockless-service validation was moved before generic variant validation so an invalid service-set update returns its specific domain error. Cart: CART-001 preserves prior products, CART-002 waits for the cross-tab lock/write, CART-003 merges identical variants within the stock cap, and CART-004 delays checkout navigation and prevents duplicate Buy Now submission.

Checkout/orders: existing E2E suites pass. Explicit direct-selection URLs and LIVE checkout retain their isolated selection behavior; only purchase-button behavior changes to the accumulated bag. Server-side price, stock and payment authority remains in the API. Browser bag prices are not treated as authoritative transaction prices.

## I. Themes / Editor

`theme:check` validates six sealed releases. `theme:test` passes 11 tests, `theme:test:store` passes 5 tests. Theme lifecycle and editor versions/AI API suites pass in the 108-test E2E run. Current themes are declarative configurations over compiled renderers; arbitrary independently executable themes are not supported or claimed.

## J. AI Agent

Sales-engine tests passed within API unit/E2E verification. No agent implementation changed. Live model quality, hallucination rates, long-conversation memory, actual provider tools and cross-channel continuity were not evaluated in this pass. Passing deterministic tests does not establish those qualities.

## K. WhatsApp / Instagram

No external messages were sent. Adapter and local sales-engine tests are included in the passing API suite; real OAuth permissions, signed incoming provider traffic, delivery receipts and outage recovery are NOT VERIFIED.

## L. Tests

| Command / verification | Result | Count / scope |
| --- | --- | --- |
| `npm run test:docker` | PASS | 53 unit suites / 359 tests; 18 E2E suites / 108 tests using isolated PostgreSQL `vendedoria_test` |
| `npm run test -w @vendedoria/store -- --watch=false` | PASS, host and Docker | 2 files / 4 cart and purchase regression tests |
| `npm run test -w @vendedoria/web -- --watch=false` | PASS | 21 files / 77 tests |
| `npm run theme:test` | PASS | 11 tests |
| `npm run theme:test:store` | PASS | 5 tests |
| `npm run theme:check` | PASS | 6 sealed releases |
| `npm run build:api` | PASS | Host and Docker |
| `npm run build:web` | PASS | Host; initial bundle 433.02 kB |
| `npm run build:store` | PASS in Docker | Initial bundle 414.09 kB; 400 kB warning budget exceeded by 14.09 kB |
| Changed JWT strategy/spec ESLint | PASS | No errors |
| Read-only broad API ESLint snapshot | FAIL | 20,149 errors and 12 warnings before final new-spec formatting correction; 19,990 errors were formatting rules |
| `npm audit --omit=dev` | FAIL | 3 high findings remain; no critical/moderate findings in final audit |
| Browser checks | PASS within scope | 4 scenarios above; manual, no screenshot artifact |

Automated test total: 564 (359 + 108 + 4 + 77 + 11 + 5), counting each executed test once, not repeated runs. Integration/API/DB/E2E categories overlap in the 108 tests and must not be summed again. Nine new authorization tests (8 unit + 1 E2E) and four new cart tests are included in these totals. Security and regression are tags, not separate additional totals.

Local transient logs: `node_modules/.cache/parity-docker-final.log`, `parity-audit-final.json`, `parity-lint.json`. These ignored files are local evidence, not durable CI artifacts. The commands and committed tests are the reproducible evidence. CI configuration was updated but a remote GitHub Actions run was not launched.

## M. Failed Tests

| Failure encountered | Root cause | Fix | Remaining issue |
| --- | --- | --- | --- |
| Initial API build failures | Incomplete host dependency/generated Prisma state | Restore dependencies and regenerate Prisma | Final builds pass |
| Initial Docker E2E: 9 theme/LIVE authorization failures | Test tokens represented users without actual membership, or role changes only in JWT claims | Create real users/memberships and use a real AGENT fixture | Full E2E 108/108 passes |
| Initial Docker E2E: 1 service catalog assertion | Generic variant validation masked service-set domain error | Run stockless shape validation first | Existing services E2E passes |
| Windows store build exit 3221225477 | Native build process crash; exact toolchain cause not established | Verify same sources through Docker Linux build | Host-specific crash unresolved; Docker build passes |
| Broad ESLint | Large existing formatting/type-safety backlog across API | Fix formatting/type issue in new JWT test; avoid global auto-fix | Full lint gate remains failing; not all findings triaged |

## N. Blocked Tests

Docker was initially unavailable, then enabled by the user; that blocker is resolved. Browser screenshot capture failed, so visual evidence could not be produced. Live Meta/Mercado Pago/AWS delivery scenarios were not executed: this pass used local fixtures and no authorized live transaction/message or dedicated provider test account flow. These are not recorded as passing.

## O. NOT VERIFIED

- Complete admin browser CRUD, navigation, accessibility, localization and error-state coverage.
- Exhaustive role-by-endpoint and tenant-by-resource matrix, production headers/CSP and deployed infrastructure.
- Real buyer payment settlement/refund and SaaS billing provider behavior.
- Live Meta onboarding, message delivery, retries and channel continuity.
- Real model-backed AI evaluations, shared identity/cart across channels, analytics reconciliation.
- Full manual classification of the copy scanner's 71 candidates (31 high, 5 medium, 35 low); scanner matches include false positives.
- Complete dead-code analysis, load testing, backup/restore drills, SEO and visual regression across all themes.
- Remote CI run and full Shopify Admin comparison.

## P. Technical Debt

Residual deepmerge-ts/Prisma advisory; broad API lint backlog; storefront initial bundle budget warning; CI lacks database E2E service setup (currently verified locally); browser cart remains separate from durable AI conversation state. None is silently marked resolved.

## Q. Remaining Gaps

| Priority | Work remaining | Acceptance evidence |
| --- | --- | --- |
| P0 assessment | Complete endpoint RBAC/tenant mutation inventory, especially settings/catalog actions available to AGENT | Matrix of real authenticated role requests and cross-tenant attempts; regressions for each confirmed gap |
| P1 | Resolve deepmerge-ts advisory with compatible Prisma configuration behavior | Clean production dependency audit plus generation/build/migration/config tests |
| P1 | Exercise provider test-mode payment, webhook replay/concurrency and channel recovery | Reproducible sandbox receipts/events with no real customer data |
| P1 | Define and implement shared customer/cart identity where required by the master protocol | Web-to-agent-to-checkout persistence and tenant isolation tests |
| P2 | Full editor/theme/admin browser matrix and meaningful lint debt reduction | Repeatable browser cases and narrowed clean lint gates |
| P2 | Add database E2E to CI | Fresh CI database/migrations and 108+ tests passing remotely |
| P3 | Accessibility, copy classification, bundle optimization and analytics reconciliation | Measured before/after evidence |
| P4 | External extension model and wider Shopify feature comparison | Explicit supported contracts and compatibility tests |

Priority of unverified areas is provisional: missing evidence is not itself proof of a vulnerability. See `docs/agent/plans/shopify-parity.md` for continuation scope.

## R. Files Changed

- Auth: `apps/api/src/auth/jwt.strategy.ts`, new `jwt.strategy.spec.ts`; `apps/api/test/team-invites.e2e-spec.ts`.
- API validation/fixtures: `apps/api/src/catalog/catalog.service.ts`; `apps/api/test/live-sales.e2e-spec.ts`, `theme-lifecycle.e2e-spec.ts`.
- Store cart/tests: `apps/store/src/app/core/cart.service.ts`, new `cart.service.spec.ts`; `apps/store/src/app/features/product/product.page.ts`, `product.page.html`, new `product.page.spec.ts`.
- Store Selecta: `apps/store/src/app/templates/selecta/home.page.ts`, `home.page.html`, `product.page.ts`, `product.page.html`, `selecta-copy.ts`.
- Demo: `apps/store/src/app/components/template-demo-banner.component.ts`.
- Test/config: `apps/store/angular.json`, `apps/store/package.json`, new `apps/store/tsconfig.spec.json`, root `package.json`, `package-lock.json`, `.github/workflows/ci.yml`.
- Docs: `CHANGELOG.md`, `apps/store/AGENTS.md`, `docs/agent/context-map.md`, this report and continuation plan.
- Reusable personal skill: `~/.codex/skills/vendedoria-commerce-parity/SKILL.md` (separate from Git repository).

The pre-existing untracked `docs/HOJA-TECNICA-VENDEDORIA.md` was preserved and is not part of these changes.

## S. Migrations

No migration or schema change added. Existing 13 migrations were checked/applied by the isolated Docker test workflow; final run reported no pending migrations. Development/production business data was not reset.

## T. Environment Changes

No environment variables or credentials changed. Host dependencies and Prisma client were restored/generated. Docker workspace dependencies were refreshed with the existing deps service, then API/web/store restarted. User stack remains running. Store test setup reuses Vitest/jsdom already used by the console. No deployment, commit or push performed.

## U. Final Quality Gate

PASS means only the stated executed scope. FAIL below means the master-plan completion gate is unmet, not that every feature in that domain is broken.

| Gate | Result | Reason |
| --- | --- | --- |
| Security | FAIL | Residual high dependency findings and incomplete endpoint matrix |
| Multi-Tenant | PASS (tested scope) | Isolation suites and membership regressions pass; exhaustive audit remains open |
| Commerce | PASS (tested scope) | Local cart/checkout/catalog/order regressions pass |
| Admin | FAIL | Full browser/role matrix NOT VERIFIED |
| Themes | PASS (tested scope) | Schema/release/runtime/lifecycle tests pass |
| Editor | FAIL | API suites pass; full browser editor matrix NOT VERIFIED |
| Storefront | PASS (tested scope) | Build, unit regressions and four preview browser scenarios pass |
| AI | FAIL | Deterministic suites pass; real model/channel quality NOT VERIFIED |
| WhatsApp | FAIL | Live provider behavior NOT VERIFIED |
| Instagram | FAIL | Live provider behavior NOT VERIFIED |
| Payments | FAIL | Local suites pass; real provider sandbox lifecycle NOT VERIFIED |
| Testing | FAIL | 564 automated tests pass, but full lint, audit, visual/provider and remote CI gates are incomplete |

Overall: changes validated within local scope; **NO-GO for claiming complete Shopify parity or a fully audited production release**.
