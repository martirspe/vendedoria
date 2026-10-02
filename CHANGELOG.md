# Changelog

## [Unreleased]

### Removed
- Flat Lima/province shipping rates (`LIMA`/`PROVINCE` modes and their `Storefront` columns): home delivery is priced only by ubigeo, with Olva/Shalom rates by distance from the store origin district; pickup stays. Past orders keep their saved delivery label

### Added
- Tabler Icons (`@tabler/icons-angular`) as the only icon set of the console, marketing site and store templates, through the `ds-icon` registry
- Selecta catalog seed (`apps/api/scripts/seed-selecta-catalog.mjs`) also sets free shipping from S/ 500, the shipping origin and the Olva/Shalom rates
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
