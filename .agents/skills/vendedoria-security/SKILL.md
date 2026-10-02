---
name: vendedoria-security
description: Security and money-integrity workflow for VendedorIA — JWT/refresh auth, @Public endpoints, Meta WhatsApp and Mercado Pago webhooks (signature + idempotency), payment flows A vs B, tenant isolation of the public store, PII in chats. Use when touching apps/api/src/{auth,payments,orders,billing,channels,storefront,conversations}, webhook handlers, payment links, credentials/env secrets, or when "webhook", "firma", "pago", "token", "seguridad" or "aislamiento" appear.
---

# VendedorIA — security & money

## Use when
- Adding/changing auth, guards, `@Public()` routes, CORS, CSP or rate limits.
- Webhooks (Meta `GET/POST /api/v1/webhooks/meta/whatsapp`, Mercado Pago in `payments.controller.ts`).
- Payment links, payment state transitions, stock decrement on paid, plan limits.
- Public store endpoints, preview tokens, store server proxy.
- Anything logging or exporting chats, phones, emails or tokens.

## Inputs
- Endpoint/flow involved and whether it is flow A (tenant SaaS billing) or flow B (buyer pays order).

## Minimal context
Start with only the relevant ones:
- Auth: `apps/api/src/auth/`, `apps/api/src/common/{guards,decorators}/`
- Payments B: `apps/api/src/payments/` (port, providers, service), `apps/api/src/orders/orders.service.ts`
- Billing A: `apps/api/src/billing/`
- Meta channel: `apps/api/src/channels/` (signature check in `channels.service.ts`)
- Public store: `apps/api/src/storefront/storefront-public.*`, `storefront-preview.ts`, `apps/store/src/server.ts`

Do NOT inspect console UI unless the task changes how a payment/channel state is shown.

## Invariants (verify each one the change touches)
- Global JWT guard; `@Public()` only for health, webhooks and store reads. Every public route performs its own verification.
- Webhooks: verify HMAC with `timingSafeEqual` on the raw signature (`x-hub-signature-256` for Meta with `META_APP_SECRET`, `x-signature` for Mercado Pago with `MERCADOPAGO_WEBHOOK_SECRET`) before any side effect; reject when a configured secret does not match. Today verification is skipped when the secret env var is empty (local dev only): production must set both secrets, and new webhook handlers must follow the same pattern.
- Idempotency: repeated deliveries must not double-apply state, stock or credits. Rely on DB unique keys (`Payment.idempotencyKey`) and state-transition guards (only move forward from the expected status).
- Payment providers stay behind `payment-provider.port.ts`; flow A code lives in `billing/`, flow B in `orders/` + `payments/`.
- `MERCADOPAGO_ACCESS_TOKEN` is a single platform token today; per-tenant credentials are a known blocker before real buyer payments (`docs/plan-tienda-web.md` §2). Do not ship features that route tenant buyers' money to the platform account without the user's decision.
- Store: tenant slug comes from the request host on the server, never from browser input; proxy stays GET-only and allow-listed; preview tokens are HMAC-signed and time-limited.
- Outbound outside the Meta 24h window only through approved templates.
- Never log raw webhook bodies; never echo secrets in error messages.
- Rate limiting: `@RateLimit(bucket, perMinute)` from `apps/api/src/rate-limit/` (per client IP, HMAC-hashed counters in `RateLimitHit`, disabled when `NODE_ENV=test`). It covers store checkout/coupon/pay/order actions and auth login/register. New anonymous sensitive endpoints must carry it. Client IPs come from Fastify `trustProxy` (loopback + private ranges); never read `X-Forwarded-For` by hand.

## Procedure
1. Classify: auth / webhook / money A / money B / public store / PII.
2. Read the minimal files above and the matching test (`*.spec.ts`, `test/*.e2e-spec.ts`).
3. Implement keeping verification before side effects and DB-enforced idempotency.
4. Add or extend a test for: bad signature, duplicate delivery, cross-tenant access, as applicable.

## Verification
- `npm run build:api`; focused jest in the dev stack; `npm run test:docker` for isolation or payment changes.
- Manual: Swagger at `http://localhost:3100/docs`; local Meta simulation and mock payment flow per README "Local WhatsApp slice smoke test".

## Definition of Done
- Each touched invariant above is satisfied or the gap is reported.
- No secret values in diff, logs, fixtures or docs; new secrets documented as placeholders in `.env*.example`.

## Avoid
- Reading `.env` files or printing environment values.
- Trusting `tenantId`, `slug`, amounts or payment status sent by a client.
- Weakening CSP, CORS or the store proxy allow-list to make something work.

## References
- Mercado Pago Orders API/Bricks/Yape: user-level skill `mercadopago-checkout-api` if available.
