# Changelog

## [Unreleased]

### Changed
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
