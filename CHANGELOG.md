# Changelog

## [Unreleased]

### Added
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
