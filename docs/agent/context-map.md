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
| Catalog | `catalog/` | `features/catalog/` | implement |
| Orders + payments (flow B) | `orders/`, `payments/` | `features/orders/`, commerce panel in `features/messages/` | security |
| Plans, limits (flow A) | `billing/` | `features/billing/` | security |
| Metrics | `metrics/` | `features/metrics/` | implement |
| Tenant store | `storefront/` | console `features/store/`; app `apps/store/`; types `packages/contracts/` | implement |
| Design system | — | `packages/ui/`, `packages/design-tokens/`, `apps/web/src/styles.scss` | ui |
| Schema / migrations | `apps/api/prisma/` | — | data |
| Docker / deploy | `Dockerfile`, `docker-compose.yml` (prod), `docker-compose.dev.yml`, `docker/nginx/`, `scripts/docker.mjs`, `.env.production.example` | — | — |

## Discrepancies (code wins; constitution items marked PLANNED)
- Webhooks (Meta, Mercado Pago) are processed synchronously in the request; queues/DLQ are PLANNED.
- Rate limiting covers store checkout endpoints and auth login/register (`apps/api/src/rate-limit/`); webhooks and AI endpoints are not limited yet (PLANNED).
- S3/CloudFront media storage is PLANNED; not implemented.
- Constitution modules `campaigns`, `integrations` (API), `analytics`, `coach` do not exist; `metrics` is the analytics module. Console `features/integrations` is UI only.
- Constitution layering (Domain/Application/Infrastructure; `shared`/`design-system` folders in web) is not how the code is organised: API is controller → service → Prisma per module; the design system lives in `packages/`.
- Mercado Pago uses one platform-wide access token; per-tenant credentials are PLANNED and block real buyer payments (`docs/plan-tienda-web.md` §2).
- `docs/plan-tienda-web.md` is a proposal written before `apps/store` existed; when it disagrees with the code, the code wins.
- CI builds api and web only; store build and tests are not in CI.
