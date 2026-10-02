# Context map

Jump table from domain to paths. API paths are under `apps/api/src/`, console paths under `apps/web/src/app/`.

| Domain | API | Console / store | Skill |
| --- | --- | --- | --- |
| Auth, tenants, settings | `auth/`, `tenants/`, `common/` | `core/auth/`, `features/auth/`, `features/settings/` | security |
| Seller config, playground, quality score | `agents/` | `features/seller/`, `features/get-started/` | implement |
| Sales agent runtime + tools | `agent-runtime/` | — | implement |
| Knowledge (FAQs, journeys) | `knowledge/` | `features/seller/` | implement |
| WhatsApp channel + Meta webhook | `channels/` | `features/channels/` | security |
| Inbox / conversations | `conversations/` | `features/messages/` | implement |
| Catalog, sets, inventory, photo upload | `catalog/` | `features/catalog/`, `features/inventory/` | implement |
| Orders + payments (flow B) | `orders/`, `payments/`, `checkout/` | `features/orders/`, `features/payments/`, commerce panel in `features/messages/` | security |
| Coupons | `coupons/` | `features/coupons/` | implement |
| Shipping, ubigeo, courier rates | `storefront/shipping.ts`, `ubigeo/` | console `features/store/`; store `core/shipping.ts`, checkout pages | implement |
| Plans, limits (flow A) | `billing/` | `features/billing/` | security |
| Metrics | `metrics/` | `features/metrics/` | implement |
| Tenant store | `storefront/` | console `features/store/`; app `apps/store/`; types `packages/contracts/` | implement |
| Store templates by industry | `storefront/` (`industry`, `template`, `templateCopy`) | `apps/store/src/app/templates/<template>/`; picker in console `features/store/` | ui |
| Design system | — | `packages/ui/`, `packages/design-tokens/`, `apps/web/src/styles.scss` | ui |
| Schema / migrations | `apps/api/prisma/` | — | data |
| Docker / deploy | `Dockerfile`, `docker-compose.yml` (prod), `docker-compose.dev.yml`, `docker/nginx/`, `scripts/docker.mjs`, `.env.production.example` | — | — |

## Discrepancies (code wins; constitution items marked PLANNED)
- Webhooks (Meta, Mercado Pago) are processed synchronously in the request; queues/DLQ are PLANNED.
- Rate limiting covers store checkout endpoints and auth login/register (`apps/api/src/rate-limit/`); webhooks and AI endpoints are not limited yet (PLANNED).
- Product photos are stored on a local volume (`UPLOADS_DIR`, `catalog/media.service.ts`); S3/CloudFront media storage is PLANNED.
- Constitution modules `campaigns`, `integrations` (API), `analytics`, `coach` do not exist; `metrics` is the analytics module. Console `features/integrations` is UI only.
- Constitution layering (Domain/Application/Infrastructure; `shared`/`design-system` folders in web) is not how the code is organised: API is controller → service → Prisma per module; the design system lives in `packages/`.
- Buyer payments (flow B) use per-tenant encrypted Mercado Pago credentials (`payments/merchant-accounts.service.ts`); without them the store runs in simulator mode.
- `docs/plan-tienda-web.md` is a proposal written before `apps/store` existed; when it disagrees with the code, the code wins.
- CI builds api and web only; store build and tests are not in CI.
