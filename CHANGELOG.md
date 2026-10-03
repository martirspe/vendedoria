# Changelog

## [Unreleased]

### Changed
- Plans page rewritten for clarity: quotas are called "chats nuevos" (a person writing for the first time; returning buyers do not count again), each plan has a one-line audience, the same item order and an action button with the plan name; features shared by every plan and the payment, WhatsApp cost and no-commission notes are listed once under the plans. Limit messages in the API and the console banner use the same wording and say what keeps working
- Plan lineup (flow A): three plans bought online plus a quoted one. Starter S/ 69 (300 conversations / month, 100 products, 3 active coupons, store with the VendedorIA badge), Pro S/ 179 (1 200 conversations, 500 products, 20 active coupons, no badge), Business S/ 449 (4 000 conversations, 2 000 products, unlimited coupons, no badge, priority support) and A medida (quoted, granted by the team; new `ENTERPRISE` tier). Business is now bought online; migration `0014_enterprise_plan` moves Business tenants granted without expiry to A medida. Active coupons are now limited per plan (creating or reactivating a coupon over the limit is refused with a Spanish message). The Plans page shows active coupons and explains that Meta bills WhatsApp messages directly to the business (1 000 free replies per number per month, then about S/ 0.10 each, Peru rates since 2026-10-01). The 30-day trial keeps 100 conversations, 20 products and 3 coupons, sized to stay inside Meta's free replies
- Plans (flow A): the Free plan is removed. Every new business starts a 30-day Starter trial with the former Free limits (100 conversations / month, 20 products); paying Starter during the trial adds the 30 paid days after the remaining trial days and unlocks the full Starter limits. When the trial or a paid period ends without renewal the plan is expired: the agent stops taking new conversations and new products are blocked until the business pays (existing chats, products and the store keep working). New prices: Starter S/ 69, Pro S/ 179, Business from S/ 499 (quoted). The console shows the trial end date, warns 7 days before it ends and when the plan expires; `PATCH /billing/plan` (switch to Free) is removed. Migration `0013_starter_trial` moves current Free businesses to a 30-day Starter trial starting on deploy

### Security
- Cloudflare Turnstile on login, sign-up and store checkout (`TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`): the widget runs in Managed mode and only appears when Cloudflare needs an interaction; the API redeems each single-use token with Siteverify after the per-IP rate limit and checks the action and that it was solved on the console or on that same store. If Cloudflare cannot be reached the request is refused (503) instead of skipping the check. Without the keys the forms keep working with rate limits only. Deploy: create a Managed widget with the console host and `STORE_BASE_DOMAIN` as hostnames and set both variables; Cloudflare test keys are rejected in production
- Meta WhatsApp webhook: the signature is now checked over the exact raw body (re-serialized JSON broke valid signatures with accents or emojis), and in production a missing `META_APP_SECRET` rejects every inbound message instead of accepting unsigned ones. Deploy: set `META_APP_SECRET` before enabling WhatsApp
- The mock checkout page (`/payments/mock-checkout/:id`) answers 404 in production, like the payment simulator
- Dependencies: Angular 22.2.1 (store pins aligned with the console), `find-my-way`, `qs`, `fast-uri` and `brace-expansion` patched; `@fastify/static` 10 (required by the updated Nest Fastify adapter; with 9 the API failed to start); `npm audit --omit=dev` down from 13 high to 4 high, all requiring major upgrades (Nest 12 for Fastify, Prisma)

### Fixed
- Saving the store settings failed with "heroImageUrl must be a URL address" when the logo, cover or banner was an image uploaded to local storage (`http://localhost…/media/…`): store image URLs now follow the same rule as product photos, and the error is in Spanish
- Production console and store containers crashed on start: `NG_TRUST_PROXY_HEADERS` in `docker-compose.yml` is now the list Angular SSR expects (`x-forwarded-host,x-forwarded-proto`) instead of `'true'`
- Production console called `http://localhost:3100` for the API: the production build now swaps in `environment.production.ts` (`/api/v1`)
- Console routes (`/app/**`) render in the browser (`RenderMode.Client`) instead of being prerendered with API calls at build time; marketing and auth pages stay prerendered
- Root `package.json` saved without BOM (Prisma and the Nest CLI failed to parse it on Windows)

### Changed
- Login and sign-up redesigned as a centered card with back link and brand mark: fields with icons, show/hide password, inline per-field errors (announced to screen readers, focus moves to the first invalid field), clear alerts for wrong credentials, rate limits, verification and lost connection, full-width submit with progress text. After signing in, the merchant returns to the console page that sent them to login (only `/app` paths)
- Production copy across the console: no development jargon (mock, smoke, playground, roadmap, waitlist, flujo A/B, handoff, env var instructions); WhatsApp diagnostics speak to the merchant; integrations categories in Spanish; product, order, payment and conversation API errors shown in the console are in Spanish
- Marketing and meta description no longer promise Instagram as available ("muy pronto")
- Console fonts are self-hosted (Satoshi 700 and Manrope in `apps/web/public/fonts`, Manrope preloaded): no requests to Fontshare or Google Fonts; the store's Manrope URL points to the current Google Fonts file (the old one returned 404)

### Removed
- Unused console placeholder page and unused dependencies (`@angular/cdk`, `supertest`, `@types/supertest`, `source-map-support`, `@eslint/eslintrc`)
- Flat Lima/province shipping rates (`LIMA`/`PROVINCE` modes and their `Storefront` columns): home delivery is priced only by ubigeo, with Olva/Shalom rates by distance from the store origin district; pickup stays. Past orders keep their saved delivery label

### Added
- Host nginx without the Cloudflare token: the bare domain, `www` and the console now get a Let's Encrypt certificate by HTTP-01 and their HTTPS server blocks, instead of falling back to another site's certificate on the shared VPS. Each host picks the certificate that covers it, port 80 always keeps the ACME path, and HSTS `includeSubDomains` is only sent once the wildcard exists.
- Production deployment guide `docs/DEPLOY.md`: Cloudflare DNS and token, VPS preparation, `.env` reference, automatic and step-by-step manual deploy, Meta / Mercado Pago / Turnstile / AWS setup, updates and rollback, daily operations, backups with cron and troubleshooting.
- One-command VPS deploy, same pattern as gohabix (`bash scripts/deploy.sh`, `npm run deploy`): generates the database password, JWT secrets and `PAYMENT_CREDENTIALS_KEY` on first boot, validates `.env`, backs up the database before recreating, builds images one at a time, waits for health and, with sudo, installs the host nginx vhost (`scripts/bootstrap-host.sh`), opens ufw 80/443 and requests one Let's Encrypt wildcard certificate (domain + `*.domain`, console included when it is `app.<domain>`) by DNS-01 with `CLOUDFLARE_API_TOKEN`. One domain: marketing site on the bare domain (`www` redirects), stores on `{slug}.<domain>`, console on `app.<domain>`; sign-in, sign-up and the console only live on the console host (the bare domain redirects `/auth` and `/app` there, and the console root goes to the marketing site). Shares `/etc/nginx/conf.d/00-ssl-global.conf` with the other apps on the VPS. Backups with database, `.env` and product photos (`scripts/backup.sh`, `scripts/restore-backup.sh`). Deploy: DNS `A @` and `A *` to the VPS, `CERTBOT_EMAIL` and `CLOUDFLARE_API_TOKEN` in `.env`
- Store subdomain can be changed from Tienda web → "Dirección de la tienda" (`PATCH /store/subdomain`): 3–40 lowercase letters, digits or hyphens, platform names reserved, up to 3 changes per 30 days. Former subdomains stay with the store (`StoreSlugRedirect`, migration `0012`): the store server redirects them to the new address keeping the path, and no other store can claim them. Deploy: run migrations
- Product photos on Amazon S3 + CloudFront (`MEDIA_STORAGE=s3`, `MEDIA_S3_BUCKET`, `MEDIA_CDN_URL`, `AWS_REGION`): uploads keep the browser resize and server byte check, go to a private bucket under `media/{tenantId}/` with random immutable names (never overwritten) and are served by CloudFront. `local` stays the default, and photos uploaded before the switch keep being served from the volume
- Every uploaded photo is normalized on the server with `sharp`: camera orientation applied, longest side up to 1600 px, WebP quality 82, location and camera metadata removed; undecodable files are rejected. Safari uploads (JPEG) are stored as WebP too
- Photos removed from a product, or of a deleted product, are deleted from S3 when nothing else of the business uses them (other products, variants, store settings). Deploy: the app IAM policy needs `s3:DeleteObject` on `media/*`
- CloudFormation template `infra/aws/media-cdn.yaml` for the media CDN: private versioned bucket, CloudFront with Origin Access Control (HTTPS only, read-only, managed caching and security headers policies, HTTP/3, optional custom domain and WAF), bucket policy pinned to the distribution and the API's least-privilege IAM policy. The AWS audit script now also checks the CloudFront distribution configuration and that photos are cached at the edge
- The API refuses to start when `MEDIA_CDN_URL` points at an S3 endpoint or includes a path: photos are always served through CloudFront. The store preconnects to the photo domain so the first images load sooner
- Order emails through Amazon SES v2 (`EMAIL_PROVIDER=ses`, default; optional `SES_REGION`, `SES_CONFIGURATION_SET`) with a plain-text part and per-kind tags; Resend stays available with `EMAIL_PROVIDER=resend`. Deploy: with `EMAIL_MODE=live` the API now refuses to start without `EMAIL_FROM` and the provider settings (before, it silently stayed in preview); an existing Resend setup must add `EMAIL_PROVIDER=resend`
- Paid plans (flow A): Starter (S/ 79) and Pro (S/ 199) are bought from Planes with VendedorIA's own Mercado Pago account (`PLATFORM_MERCADOPAGO_ACCESS_TOKEN`, `PLATFORM_MERCADOPAGO_WEBHOOK_SECRET`), never the store's. A plan is granted only by a confirmed payment of that tenant (signed webhook `POST /webhooks/billing/mercadopago` or return confirmation, amount and currency checked, applied once) for 30 days; renewing the same plan adds the days, and an expired plan falls back to Free limits. `PATCH /billing/plan` only allows downgrading to Free; Business stays on request. Without credentials, development uses a simulated payment and production disables checkout. Deploy: set both variables and register the webhook URL in the Mercado Pago panel
- Delete a product from the console editor (`DELETE /catalog/products/:id`): it leaves the catalog, store and inventory; past order lines keep their snapshot, and set pieces must leave their sets first
- Lucide (`@lucide/angular`) as the only icon set of the console, marketing site and store templates, through the `ds-icon` registry; brand logos (WhatsApp) use their official SVG. Replaces Tabler, whose imperatively appended SVG was duplicated on SSR hydration (every icon showed twice)
- Selecta catalog seed (`apps/api/scripts/seed-selecta-catalog.mjs`) also sets free shipping from S/ 500, the shipping origin and the Olva/Shalom rates
- Selecta catalog seed synced with Selecta's latest products: Set Osadía Infinita (S/ 185.25) and Shampoo acondicionador Baby (S/ 21.00) now priced, Shampoo Triple Acción Vivo in 250 ml and the real photo of Solo Jabón en Barra. Re-running the seed prices and publishes products that were still loaded without price; prices set in the console are kept
- Selecta template parity: bag quantities capped by stock, live catalog prices in bag and checkout, coupon re-check on delivery changes, free shipping coupons rejected for pickup or orders that already ship free, pickup address revealed only after payment, "Consultar estado" on orders in review, refund and rejected payment titles, legacy Selecta URLs redirected, WhatsApp message with product codes and link, product JSON-LD with all photos
- Store payload exposes the shipping origin (`shipping.origin`) for buyer-facing copy
- Store templates by industry: the merchant picks the business industry and a template in Tienda; the first one, Selecta (Belleza y cuidado personal), brings the full Selecta storefront (home, product page, bag, checkout, order/payment page, legal center, 404) with editable texts per store
- Product sets with shared inventory (pieces per SKU, reserved and released with the set), set offers on the product page, complements in the bag and an order bump in checkout
- Coupons by product line, option to exclude sets, and campaign links (`?cupon=`) applied at checkout
- Courier rates by distance (Olva/Shalom) from the store origin ubigeo, with explicit acceptance of the reference rate by the buyer
- Order logistics: ready for pickup, delivered and tracking code in the console, order page and emails; payment reconciliation with the Mercado Pago reference and email preview
- Console Inventario page (stock per SKU) and product photo upload
- Rate limiting per client IP (HMAC-hashed, Postgres-backed) on store checkout, coupon preview, payment, order actions, login and register; 429 with a Spanish message
- Peruvian ubigeos (INEI 2025, 1 892 districts) in the store checkout: department → province → district selects; the server validates the district and that Lima Metropolitana/Callao use the Lima rate
- Web store checkout per tenant: Mercado Pago Card Brick and Yape with per-tenant encrypted credentials and webhook, stock reservation with 15-minute expiry, idempotent orders, coupons, shipping rules, order page and confirmation email
- Legal center per store (terms, privacy, cookies, shipping, returns, promotions) and publish requirements (legal identity, complaints book, contact email, delivery)
- Console pages Cobros (Mercado Pago account) and Cupones; WhatsApp sales agent understands web cart orders and links to product pages
- Help/Learn page (`/app/help`) with in-app guides and Ctrl+K hint
- Console command palette (Ctrl+K): quick nav + Connect WhatsApp + Test seller
- Plan quota enforcement (products + new conversations) with `/billing/usage` banner
- WhatsApp channel diagnostics API + actionable checks UI on Canales
- Inbox: Sale filter, URL-synced filters, commerce-in-thread panel (order + payment status)
- Knowledge module: FAQs + journey templates API (`/knowledge`), paste-import as draft with human approve
- Seller console: knowledge base, journey scripts, and hard agent limits (catalog-only / no fake discounts / no invented shipping)
- Sales-agent runtime tool `lookup_faq` + FAQ/journey context in LLM prompt and deterministic fallback
- Agent quality score now includes published FAQs and active journeys (max 240)

### Changed
- Console shell: Lucide icons in sidebar, Vender/Negocio groups, sticky branded rail, denser active states
- Project Constitution: competitive thesis — category parity is the floor; every module must ship a clear “one step beyond” wedge vs. YaVendió-class referents (no clone)

### Added
- Commerce Flow B: Payment Provider Port with Mercado Pago + mock provider, idempotent webhooks, and stock decrement on paid
- Orders API (`/orders`) with create-from-chat, payment-link generation, and status transitions
- Orders console: kanban/table views, detail drawer, mock “Simular pago”, and Create order from Messages inbox
- Seller console: configure sales-agent personality, welcome/handoff messages, quality score, and live greeting preview
- Agent quality score on `GET/PATCH /agents/primary` (0–200) with actionable missing-field hints
- Sales-agent runtime now applies personality, greeting, emoji/length tone, and respects `pauseOnHandoff` on escalate
- WhatsApp Cloud API channel connect, Meta webhook verify/receive, and local inbound simulation
- Conversations inbox API with Sale / Unattended / agent pause and 24h messaging window checks
- Minimal sales-agent runtime (catalog search + escalate + optional OpenAI fallback)
- Console UX for Channels and Messages (inbox split-view)
- Monorepo foundation (`apps/api`, `apps/web`) for VendedorIA
- NestJS + Fastify API with JWT auth, multi-tenant Prisma schema, health, tenants, agents, catalog modules
- Angular 22 zoneless SSR web app with Design System tokens and marketing/auth/console shells
- `.env.example`, root workspace scripts, and CI build workflow
