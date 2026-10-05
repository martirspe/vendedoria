---
name: vendedoria-tiktok-live
description: Implement, maintain or troubleshoot VendedorIA's TikTok LIVE integration, manual live sales and liquidation campaigns, capability adapters, OAuth, atomic inventory reservations, shared checkout/payments and SSE operations panel. Use for TikTok LIVE changes in this repository; not for unrelated TikTok content, scraping or general release audits.
---

# VendedorIA — TikTok LIVE

Work inside the VendedorIA checkout. Paths below are relative to its repository root. Read the applicable `AGENTS.md` and only the affected domain. Use `docs/TIKTOK-LIVE.md` for configuration, exact endpoints and operational limitations; use `docs/TIKTOK-LIVE-VALIDATION.md` for recorded verification. The executable code remains authoritative.

## Route the task

| Change | Entry points |
| --- | --- |
| Activation, plan or sidebar | API `billing/plan-catalog.ts`, `integrations/integration-state.ts`; console `core/integrations/integrations-state.service.ts`, `features/integrations/` |
| Official account connection | `apps/api/src/live/tiktok-client.ts`, `tiktok-integration.service.ts`, `live.controller.ts`; config validation and both `.env*.example` |
| Capability or another official channel adapter | `apps/api/src/live/live-adapter.ts`, binding in `live.module.ts` |
| Campaign, product context, intent, operational panel | `apps/api/src/live/live.service.ts`, `live-intent.ts`, `dto/live.dto.ts`; `apps/web/src/app/features/live/`, `core/api/live-api.service.ts` |
| Reservation or payment | `apps/api/src/live/live-reservations.ts`, existing `checkout/checkout.service.ts`, `orders/{stock,settlement,orders.service}.ts` |
| Buyer checkout | `packages/contracts/index.d.ts`, `apps/store/src/app/app.routes.ts`, classic `features/checkout/`, `core/cart.service.ts`, SSR proxy in `apps/store/src/server.ts` |
| Model clarification | Existing `agent-runtime/sales-agent-runtime.service.ts` → `suggestLiveQuestion` |
| Realtime | Existing console `core/api/inbox-stream.service.ts`; backend `LiveService.stream` |

Load the repository's data, security or UI skill only when the change needs those workflows. Do not expand a targeted integration change into an unrelated cleanup or audit.

## Preserve commercial truth

- `LiveService` consumes `LiveIntegrationAccess`; vendor OAuth and wire formats stay outside the commercial engine. `LiveChannelAdapter` declares capabilities, not presumed access.
- At the implemented baseline, official Login Kit supports identity with `user.info.basic` and signed deauthorization notices. LIVE comments, automatic replies and broadcast control are unsupported. Shop product/order/sync adapters are pending access and implementation. Recheck official TikTok documentation before changing a capability; a newly received scope string alone is insufficient.
- Keep manual input/output explicit. `HUMAN_APPROVAL` suggests and records human review, `HUMAN_ONLY` classifies, and `AUTO` requires a verified outbound capability. Never record a manual suggestion as delivered to TikTok or send Meta templates through a LIVE channel.
- Deterministic intent precedes the LLM. `suggestLiveQuestion` only selects an allowed clarification question, respecting the existing AI quota. Price, stock, shipping, payment methods and reservation confirmation must come from backend services. An intent is not a confirmed reservation.
- Campaign offers become immutable when started. Offer duration starts at session start; the campaign end further restricts it. A campaign's allocated units are a ceiling over the shared catalog, not a second inventory balance.

## Preserve stock and money integrity

- Tenant and role come from JWT or validated store access. Scope campaign/session/offer/reservation queries by that tenant. The operator's buyer alias is HMAC-scoped and only enforces the per-session alias limit; do not represent it as verified TikTok identity.
- Create holds in one PostgreSQL transaction: lock session, validate offer/time/limits, atomically increase `claimedQty`, apply existing `withAllocations` and `reserveStock`, persist the snapshot and idempotency event. Never create a parallel inventory service or decrement stock again at checkout.
- Transfer a pending reservation under its row lock to the existing order; preserve snapshot price, quantities, component allocations and original expiry. Keep `TIKTOK_LIVE` accepted by public order ownership, commerce payment, reconciliation and settlement filters as well as order creation.
- `releasePendingLiveReservation` returns pre-order stock and allocation. Once attached to an order, existing order release restores physical stock and the LIVE helper releases only allocation. Repeated pay/cancel/expiry must change status and record their durable event once.
- Reuse the existing checkout sweep for expiry and inbox SSE transport for refresh. Deactivation blocks new operations/streams while held stock still expires and existing orders remain payable. No always-on LIVE worker is needed.
- Preserve the normal buyer cart: `/live-checkout` has a route-scoped `CartService`, `restoreTransient`, and a checkout idempotency key per reservation. Never erase the saved ordinary cart, coupon or recovery token as a side effect of LIVE checkout.

## OAuth and event invariants

- Store access/refresh tokens with the existing AES-256-GCM credential cipher. Return safe connection fields only; never read or print real environment secrets.
- `state` is random, hashed, short-lived and single-use, including failed code exchanges. Its HttpOnly/Secure/SameSite=Lax cookie binds the browser; Angular must request credentials on connect. Require the registered exact HTTPS callback and a single configured console redirect origin.
- Serialize refresh rotation on the integration row. Preserve a rotated refresh token even if the following account validation fails. Preserve the authorization timestamp through refresh so delayed old revocations cannot erase a newer connection.
- Verify TikTok's official signature against exact raw bytes and timestamp before parsing/processing. Validate client/account, deduplicate the semantic external event per tenant and ignore disabled integrations. A Login Kit deauthorization notice is not a LIVE comment webhook.
- Exclude query strings, cookies, authorization and provider credential bodies from logging. Signed buyer links require `no-referrer` and private/no-store rendering.

## Verify the affected change

Use Docker's mounted dependency volumes, not assumptions about the host's generated Prisma client. If a delegate such as `recoveryCart` or `liveReservation` is missing, run Prisma generation inside API, then check migration status. A migration alone does not generate client types. If Docker is absent from PATH on Windows, use the locator already implemented in `scripts/docker.mjs` and verify `compose ps` before concluding the stack is unavailable.

Focused baseline commands:

```sh
docker compose -f docker-compose.dev.yml exec -T api npx prisma generate
docker compose -f docker-compose.dev.yml exec -T api npx prisma migrate status
docker compose -f docker-compose.dev.yml exec -T api npx eslint src/live test/live-sales.e2e-spec.ts
docker compose -f docker-compose.dev.yml exec -T api npx jest --runInBand live
docker compose -f docker-compose.dev.yml exec -T -e NODE_ENV=test -e DATABASE_URL=postgresql://postgres:postgres@postgres:5432/vendedoria_test?schema=public -e OPENAI_API_KEY= -e MERCADOPAGO_ACCESS_TOKEN= api npx jest --config test/jest-e2e.json --runInBand live-sales.e2e-spec.ts
```

For schema changes, apply new migrations to the isolated test database before E2E. Never rewrite a migration already applied to development or production. Build every affected app; contract changes require API/web/store builds. Use `npm run test:docker` for changes spanning stock, orders, payment or configuration, and Angular's tests for SSE/UI logic.

The essential regression is two concurrent buyers contesting one remaining unit: exactly one hold succeeds, physical stock never goes negative, cancellation/expiry restores it once and payment converts it once. Also cover foreign tenants, manager-only settings, signed token expiry, unsupported AUTO, exact webhook signatures, duplicates, OAuth browser/state binding and refresh rotation.

For UI work, inspect an active panel and buyer checkout using disposable local fixtures. Check desktop and mobile, loading/error/empty/success, Spanish intent/capability labels and design-system tokens. Remove only the fixtures you created. Do not call real TikTok delivery or charge a real account as a test.

Record actual results and external verification gaps. Update `CHANGELOG.md` and the integration guide for product-relevant changes. Local mocks prove protocol/control behavior; they do not prove a real account has TikTok's approval or that the provider accepted the deployed callback.
