# Security audit — threat map

Walk in order. For each check, find the control and cite it, or mark it missing.

## 1. Tenant isolation (P0)
- Every tenant-owned query filters by `tenantId` from `@CurrentUser()` (console) or the store host (`storefront-public.*`). Controllers never accept `tenantId`/`slug` in body or query.
- Child models (`ProductVariant`, `ProductMedia`, `Message`, `OrderItem`, `PlaygroundMessage`, `ProductComponent`) are reached through a tenant-scoped parent.
- Writes by id: `findFirst({ where: { id, tenantId } })` before `update/delete`, or `updateMany/deleteMany` with `tenantId` in `where`.
- Cross-entity references in DTOs (product ids in sets, coupon targets, order lines) are re-checked against the caller's tenant.
- Store server (`apps/store/src/server.ts`): slug comes only from `GET /storefront/resolve` with the request host; proxy `PROXY_GET`/`PROXY_POST` allow-lists; preview token only via signed cookie/header.
- Reference test: `apps/api/test/storefront-isolation.e2e-spec.ts`.

## 2. Authentication & sessions (P0/P3)
- `JwtAuthGuard` registered as `APP_GUARD` (`auth/auth.module.ts`); `@Public()` only for health, webhooks, store reads/checkout, media reads, auth login/register/refresh.
- Access/refresh secrets required and distinct (`env.validation.ts`); refresh tokens stored hashed and rotated; logout revokes.
- Passwords with bcrypt; login/register rate-limited; generic error for wrong email vs password.
- Console stores tokens in `localStorage` (`apps/web/src/app/core/auth/auth-api.service.ts`): XSS would expose them. Treat as P3 hardening (httpOnly cookie migration is a product/infra decision → Deferred unless asked); keep CSP strict and no `innerHTML` to compensate.

## 3. Webhooks & money (P1)
- Meta WhatsApp: verify token on GET; `x-hub-signature-256` HMAC with `META_APP_SECRET` via `timingSafeEqual` before processing (`channels/channels.service.ts`). Production must not run with an empty secret.
- Mercado Pago (store checkout, per-tenant credentials): `checkout/mercadopago-webhook.controller.ts`, `payments/mercadopago.client.ts` — signature (`x-signature` + `x-request-id` manifest) checked with the tenant's webhook secret before side effects; payment status re-fetched from Mercado Pago, never trusted from the webhook body.
- Idempotency: DB unique keys (`Payment.idempotencyKey`, order idempotency) and forward-only status transitions; stock reserved/restored once (`orders/stock.ts`).
- Amounts always recomputed on the server (catalog prices, coupons, shipping quotes); integer cents.
- Mock provider: `MockPaymentProvider`, `simulateMockPayment`, mock checkout page — must be unreachable or refused in production.
- Flow A (`billing/`) never touches flow B (`orders/`, `payments/`, `checkout/`) code paths or credentials.
- Per-tenant payment credentials encrypted with `PAYMENT_CREDENTIALS_KEY`; never returned to the client after saving (only masked status).

## 4. PII & logging (P1)
- Fastify logger: request logs must not include bodies or auth headers; no logging of phones, emails, chat text, webhook payloads, tokens.
- Error responses: no stack traces or provider error bodies in production; Nest default filter is fine, custom filters must not echo internals.
- API responses: select only needed fields (no `passwordHash`, token hashes, encrypted credentials, other tenants' data).
- Emails and WhatsApp templates contain only the buyer's own order data.

## 5. Injection, XSS, SSRF, redirects, uploads (P2)
- Angular templates use binding; any `innerHTML` uses trusted, escaped content; no `bypassSecurityTrust*` on user data. Tenant-editable store texts render as text.
- Email HTML escapes every user/tenant value.
- Prisma raw queries only via tagged templates with parameters.
- No server-side fetch of user-supplied URLs (product image URLs are rendered by the browser, not fetched by the API). If any exists: allow-list hosts, block private IPs.
- Redirects: store preview redirect builds a same-origin path; dev loopback redirects are dev-only; no `?next=` style open redirects.
- Uploads (`catalog/media.service.ts`): content-type allow-list (jpeg/png/webp), size cap, magic-byte check, random file names, served with `X-Content-Type-Options: nosniff`.

## 6. Abuse & limits (P2)
- `@RateLimit` on store checkout, coupon preview, pay, order actions, login, register, media upload; new anonymous sensitive endpoints too.
- Body size limits (store proxy JSON 32kb; API Fastify defaults), pagination caps, max array sizes in DTOs (`@ArrayMaxSize`).
- Sales agent / playground: per-tenant plan limits (`billing/plan-limits.service.ts`); LLM calls bounded.

## 7. Configuration & infrastructure (P3, some P0)
- Secrets only via env; `.env*` gitignored except examples; `git log -p` not needed — search the tree: `rg -n "(sk_live|APP_USR-|EAA[A-Za-z0-9]{20,}|-----BEGIN)" --hidden --glob '!node_modules'`.
- `env.validation.ts`: production should require what production needs (`META_APP_SECRET`, `PAYMENT_CREDENTIALS_KEY`, email settings when `EMAIL_MODE` is real). Making a var required is a deploy-impacting change → report under Deploy notes.
- CORS: explicit `CORS_ORIGIN` list, `credentials: true` only with explicit origins.
- Headers: nginx `docker/nginx/security-headers.conf` (CSP, frame, nosniff, referrer, HSTS at the host nginx); store server CSP only in the standalone server; API behind nginx.
- Swagger: `SwaggerModule.setup('docs', …)` runs in every environment (`apps/api/src/main.ts`), while production nginx (`docker/nginx/default.conf.template`) only proxies `/api/`. Verify `/docs` stays unreachable from outside; any nginx change that exposes it is a finding.
- Containers: production images run as `USER node` (`Dockerfile`), no dev dependencies, no source maps with secrets; only the internal nginx is published, on `127.0.0.1:${WEB_PORT}` (`docker-compose.yml`); Postgres, api, web and store stay on the Docker network; public traffic and TLS go through the host nginx.
- Dependencies: `npm audit --omit=dev`; prefer patch/minor bumps; document Deferred CVEs with reachability reasoning.

## Status labels
| Status | Meaning |
| --- | --- |
| Fixed | Patched in this pass (cite file) |
| Already OK | Control verified (cite file:line) |
| Deferred | Needs decision/infra; include owner and impact |
| Accepted risk | User explicitly accepted |
