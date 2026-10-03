# Production configuration checklist

Each item: verify in the repo, fix repo gaps, and list server-side actions as "Deploy actions" (names only, never values).

## Environment
- [ ] Every var read by the API is declared in `apps/api/src/config/env.validation.ts` and documented in `.env.example` and `.env.production.example` with placeholders.
- [ ] Production-critical vars are not optional in practice: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (distinct, long), `PAYMENT_CREDENTIALS_KEY`, `META_VERIFY_TOKEN`, `META_APP_SECRET` (commented out in `.env.production.example` → webhook signatures would be skipped), `CORS_ORIGIN`, `PUBLIC_API_BASE_URL`, `STOREFRONT_URL_TEMPLATE` / `STORE_BASE_DOMAIN`, `CONSOLE_HOST`.
- [ ] Decide fail-closed behavior: either validation requires them when `NODE_ENV=production`, or the report lists them as Deploy actions. Making them required can block the next deploy → Decision.
- [ ] `NODE_ENV=production` set for api, web and store in `docker-compose.yml` (dev-only code keys off it).
- [ ] No dev defaults leaking: `localhost` fallbacks in `apps/store/src/server.ts` (`STORE_API_URL`), `apps/web/src/environments/environment.production.ts` points to the production API base (relative `/api/v1` or the real host).

## Payments (flow B) and plans (flow A)
- [ ] Without tenant Mercado Pago credentials the store runs in "pedir por WhatsApp" mode; mock checkout/simulate endpoints are refused in production.
- [ ] Webhook URLs documented for tenants (Cobros page) use the production API host over HTTPS.
- [ ] Flow A billing: plan limits enforced; no test plans or free overrides hardcoded.

## Meta / WhatsApp
- [ ] Webhook verify token and app secret configured; signature verification active.
- [ ] Outbound outside 24h window only with approved templates; template names not hardcoded to test ones.

## Email
- [ ] `EMAIL_MODE=preview` is the example default: production needs `EMAIL_MODE=live` with SES (domain identity with DKIM/SPF/DMARC, out of the sandbox) and `EMAIL_FROM` on that domain → Deploy action / Decision. Audit with `vendedoria-aws` → `scripts/check-aws.mjs`.

## Media (S3 + CloudFront)
- [ ] Production uses `MEDIA_STORAGE=s3` with a private bucket behind CloudFront OAC and a least-privilege IAM principal (`vendedoria-aws`); the `uploads` volume is kept for photos uploaded before the switch.
- [ ] Email links use production hosts (console and `{slug}.<STORE_BASE_DOMAIN>`), not localhost.

## Bot protection (Cloudflare Turnstile)
- [ ] `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` of a Managed widget whose hostnames are `CONSOLE_HOST` and `STORE_BASE_DOMAIN` only (no `localhost`); not Cloudflare test keys (the API refuses them in production).
- [ ] `GET /api/v1/turnstile/config` returns the site key; login, sign-up and a store checkout succeed in a real browser, and a request without `X-Turnstile-Token` answers 403.

## AI
- [ ] `OPENAI_API_KEY` optional: deterministic fallback works without it; with it, model name set and costs bounded by plan limits.

## Docker / nginx
- [ ] `docker-compose.yml`: only internal nginx published on `127.0.0.1:${WEB_PORT}`; healthchecks for every service; restart policies; named volumes for Postgres and uploads (`UPLOADS_DIR`).
- [ ] `Dockerfile`: multi-stage, `USER node` in runtime stages, production dependencies only where the runtime needs `node_modules` (`npm ci --omit=dev`), no `.env` copied (`.dockerignore`).
- [ ] `docker/nginx/default.conf.template`: only `/api/` proxied to the API (Swagger `/docs` stays internal), webhooks and auth locations correct, body size limits, security headers snippet included everywhere, wildcard store host routed to the store server.
- [ ] Host-level TLS (wildcard certificate for stores) and HSTS documented in README "Producción".
- [ ] Migrations run through the `migrate` service (`prisma migrate deploy`), never `migrate dev`/`db push`.

## Store & SEO
- [ ] `robots.txt`/`sitemap.xml` from the store server use the tenant host; preview/unpublished stores send `noindex` and `private, no-store`.
- [ ] Marketing pages: titles, meta descriptions, canonical URLs and OG tags point to production domain; no "localhost" or example domains.
- [ ] Store CSP active in the standalone server; Mercado Pago domains present only where needed.

## Data & operations
- [ ] Backups for Postgres and uploads documented and tested (restore path in README).
- [ ] Logs: Fastify logger level appropriate; no PII; log rotation on the host.
- [ ] Seed scripts (`apps/api/scripts/seed-*.mjs`) are manual tools, not executed by the production stack.
- [ ] Health endpoints: `/api/v1/health`, store `/healthz`, web `/healthz`, nginx `/nginx-health` wired to healthchecks.

## Release hygiene
- [ ] `CHANGELOG.md` `[Unreleased]` complete; version bump if the project versions releases.
- [ ] CI (`.github/workflows/ci.yml`) green; store build and tests verified locally (CI does not run them).
