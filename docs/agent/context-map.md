# Context map

Jump table from domain to paths. API paths are under `apps/api/src/`, console paths under `apps/web/src/app/`.

| Domain | API | Console / store | Skill |
| --- | --- | --- | --- |
| Auth, tenants, settings | `auth/`, `tenants/`, `common/`, `turnstile/` (Cloudflare Turnstile guard) | `core/auth/`, `features/auth/`, `features/settings/` | security |
| Seller config, playground, quality score | `agents/` | `features/seller/`, `features/get-started/` | implement |
| Sales agent runtime + tools | `agent-runtime/` | — | implement |
| Stateful AI Sales Engine, durable channel inbox, read tools, semantic catalog/FAQ index and evaluation | `agent-runtime/sales-*`, `conversations/sales-gateway.service.ts`; operations `docs/AI-SALES-ENGINE.md`; dataset `docs/agent/evals/` | existing Inbox / Playground | implement, data, security; personal `vendedoria-ai-sales-engine` |
| Knowledge (FAQs, journeys) | `knowledge/` | `features/seller/` | implement |
| WhatsApp channel + Meta webhook | `channels/` | `features/channels/` | security |
| Inbox / conversations | `conversations/` | `features/messages/` | implement |
| TikTok LIVE sales, liquidation and reservations | `live/`, `checkout/`, `orders/settlement.ts` (stock transfer/payment); official OAuth adapter in `live/tiktok-*` | `features/live/`, integration registry; store universal `/live-checkout`; guide `docs/TIKTOK-LIVE.md` | implement, data, security, ui; personal `vendedoria-tiktok-live` |
| Catalog, sets, inventory, photo upload, catalog package import (`catalog-import.ts` pure plan + `catalog-import.service.ts`) | `catalog/` | `features/catalog/` (`catalog-import.page`, `catalog-package.ts`), `features/inventory/` | implement |
| Classification and variant combinations | `catalog/catalog-classification.ts`, `catalog/variant-options.ts`; optional `CatalogCategory` hierarchy and JSON schemas; audit `docs/CATALOG-COMMERCE-AUDIT.md` | `features/catalog/variant-combinations.ts`, progressive product editor; store `core/checkout-context.ts` | implement, data, security, ui |
| Orders + payments (flow B) | `orders/`, `payments/`, `checkout/` | `features/orders/`, `features/payments/`, commerce panel in `features/messages/` | security |
| Cart recovery and behavioral recommendations | `conversion/` (recovery outbox/worker, affinity ranking and optional Qdrant indexing) | console `features/store/conversion-settings.component.*`; store `components/{cart-recovery,recommendations}.component.*`; guide `docs/CONVERSION.md` | implement, data, security, aws, ui |
| Coupons | `coupons/` | `features/coupons/` | implement |
| Shipping, ubigeo, courier rates (business-wide, not gated by the store add-on) | `shipping/` (settings API), `storefront/shipping.ts` (pricing), `agent-runtime/delivery-plan.ts` (agent quote), `ubigeo/` | console `features/shipping/`; store `core/shipping.ts`, checkout pages | implement |
| Buyer notifications and return after paying (flow B) | `orders/order-notifications.service.ts`, `channels/channel-messenger.service.ts`, back URLs in `payments/payments.service.ts` | public `features/payment-result/` (`/payment/:state`) | security |
| Plans, limits, prepay, chat packs, AI cap (flow A) | `billing/` (`plan-catalog.ts` is the single source of prices and limits) | `features/billing/` | security |
| Plan integrations (web store add-on, custom domain, pixel/GA4, Instagram, team; dependencies in `INTEGRATION_REQUIRES` pause, never turn off, the dependent) | `integrations/` (state, custom domain + Cloudflare for SaaS), `team/`, `channels/` (Instagram); store gate in `storefront/storefront-public.service.ts` and `storefront.service.ts` | `features/integrations/` (activation + `integration-gate`), `features/{domain,tracking,instagram,team}/`, `features/auth/invite.page`, sidebar from `core/integrations/`; store `core/analytics.service.ts`, `components/consent-banner` | security |
| Metrics | `metrics/` | `features/metrics/` | implement |
| Tenant store | `storefront/` | console `features/store/`; app `apps/store/`; types `packages/contracts/` | implement |
| Store themes, release compatibility and updates | `storefront/{theme-release,store-templates,storefront-editor.service}.ts`; registry/contracts/schemas `packages/themes/`; guide `docs/THEMES.md`, audit/report `docs/THEMES-{AUDIT,REPORT}.md` | compiled renderers `apps/store/src/app/templates/`; picker/manager/editor `features/store/`; SDK `scripts/{create-theme,theme-check,seal-theme-releases,build-theme-catalog}.mjs` | implement, ui, data, security |
| Visual store editor (draft/publish) | `storefront/storefront-editor.service.ts` (`templateDraft`) | console `features/store/store-editor.page.*`; store `core/store-editor.ts` (postMessage bridge + directives) | ui, security |
| Design system | — | `packages/ui/`, `packages/design-tokens/`, `apps/web/src/styles.scss` | ui |
| Schema / migrations | `apps/api/prisma/` | — | data |
| AWS media (S3 + CloudFront) and email (SES) | `catalog/media.service.ts`, `checkout/order-email.service.ts`, `config/env.validation.ts`, `infra/terraform/` (Terraform: bucket + CloudFront + SES + IAM + Cloudflare DNS) | — | aws |
| Docker / deploy | `Dockerfile`, `docker-compose.yml` (prod), `docker-compose.dev.yml`, `docker/nginx/`, `scripts/docker.mjs`, `scripts/{deploy,bootstrap-host,backup,restore-backup}.sh`, `.env.production.example`, guide `docs/DEPLOY.md` | — | — |

## Discrepancies (code wins; constitution items marked PLANNED)
- LIVE campaigns now exist in `live/` and use tenant-owned durable analytics events; they do not provide general marketing campaigns. Login Kit does not grant LIVE comment/reply access. Real-time LIVE reuses authenticated inbox SSE with durable event/stock polling, and expiration reuses the checkout sweep.
- Webhooks (Meta, Mercado Pago) are processed synchronously in the request; queues/DLQ are PLANNED.
  - AI Sales Engine v2 now durably captures WhatsApp/Instagram text and generates/sends asynchronously with PostgreSQL inbox/outbox plus Redis leases. Legacy channel mode and payment webhooks remain synchronous; ambiguous sends require human review rather than automatic retry.
- Rate limiting covers store checkout endpoints and auth login/register (`apps/api/src/rate-limit/`); webhooks and AI endpoints are not limited yet (PLANNED). Login, sign-up and store checkout also require a Cloudflare Turnstile token when `TURNSTILE_SECRET_KEY` is set (`apps/api/src/turnstile/`, widget `ds-turnstile` in `packages/ui`); coupon preview and order actions rely on the rate limit and the order capability token.
- Product photos (`catalog/media.service.ts`) go to S3 + CloudFront with `MEDIA_STORAGE=s3`, or to the local volume (`UPLOADS_DIR`, default); the `/media/:file` route keeps serving pre-S3 uploads. Uploads are normalized to WebP with `sharp`; unused S3 photos are deleted on product update/delete. AVIF variants (on-the-fly service behind CloudFront) are PLANNED. AWS setup: `vendedoria-aws` skill.
- Order emails (`checkout/order-email.service.ts`) send through Amazon SES (default) or Resend when `EMAIL_MODE=live`; SES bounce/complaint SNS processing is PLANNED (rely on the SES account suppression list).
- Constitution modules `campaigns`, `analytics`, `coach` do not exist; `metrics` is the analytics module. The `integrations` API module covers plan features only (no third-party e-commerce, shipping or ERP connectors yet).
- Access tokens are not checked against the membership: a removed or re-roled member keeps API access until the access token expires (refresh tokens are revoked).
- Constitution layering (Domain/Application/Infrastructure; `shared`/`design-system` folders in web) is not how the code is organised: API is controller → service → Prisma per module; the design system lives in `packages/`.
- Buyer payments (flow B) use per-tenant encrypted Mercado Pago credentials (`payments/merchant-accounts.service.ts`); without them the store runs in simulator mode.
- `docs/plan-tienda-web.md` is a proposal written before `apps/store` existed; when it disagrees with the code, the code wins.
- Shipping settings are business-wide (`/shipping`, used by the agent and the store) but their columns still live on the `Storefront` row, created on first use by `storefront/storefront-row.ts`.
- CI now builds API, web and store and runs theme/schema/runtime and console tests. API unit/e2e remains local Docker verification on the isolated test database.
- Themes v1 are declarative packages over reviewed compiled platform renderers, with pinned ABI/releases and additive migration; no arbitrary plugin execution or free-form page builder. Legacy built-in content keys remain shared across presentations; snapshots without identity cannot reconstruct their original template. See `docs/THEMES.md`.

- Conversion uses Redis/BullMQ for recovery and optional Qdrant for catalog affinity; PostgreSQL remains authoritative. PostGIS is not used: neither recovery nor recommendations needs geolocation. Webhook ingestion remains synchronous.
