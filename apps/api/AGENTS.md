# apps/api — NestJS API

Global rules live in the root `AGENTS.md`. Data work: `vendedoria-data` skill. Auth/webhooks/payments/channels: `vendedoria-security` skill.

## Structure
- One Nest module per domain: `src/<domain>/{<domain>.module,.controller,.service}.ts` + `dto/`. New modules are registered in `src/app.module.ts`.
- Existing domains: `auth`, `tenants`, `agents` (+ playground, quality score), `agent-runtime` (sales agent + tools), `knowledge`, `catalog`, `channels` (Meta WhatsApp), `conversations`, `orders`, `payments`, `billing` (plans + limits), `metrics`, `storefront`, `coupons`, `checkout` (web store orders + Mercado Pago), `ubigeo` (INEI districts in `data/`, rebuilt with `scripts/compile-ubigeos.mjs`), `rate-limit`, `health`.
- Layering is controller → service → `PrismaService`. There is no repository or domain layer; do not introduce one for a single feature.

## Invariants
- Controllers stay thin and never inject `PrismaService`. They pass `user.tenantId` from `@CurrentUser()` as the first service argument.
- `JwtAuthGuard` is global (`APP_GUARD` in `auth/auth.module.ts`). Anonymous routes need `@Public()` and must verify the caller themselves (signature, preview token, host).
- Global `ValidationPipe` uses `whitelist` + `forbidNonWhitelisted` + `transform`: every body/query field needs a class-validator DTO or the request is rejected.
- Controllers carry `@ApiTags`; authenticated ones `@ApiBearerAuth()`. Swagger is the public API contract.
- New env vars: add to `src/config/env.validation.ts`, `.env.example` and `.env.production.example` with placeholder values only.
- Payment providers implement `payments/payment-provider.port.ts`; orders and billing never call a vendor directly. Mock provider is used when Mercado Pago credentials are empty.
- Sales agent: `agent-runtime/`. Tools read catalog truth through `sales-agent-tools.service.ts`; OpenAI is optional with a deterministic fallback. A future merchant coach must be a separate runtime with separate permissions.
- Public store payloads are typed in `packages/contracts`; change the contract and `storefront-mapper.ts` together.

## Tests
- Unit: `src/**/*.spec.ts` next to the source (jest `rootDir: src`). E2E: `test/*.e2e-spec.ts` (`test/storefront-isolation.e2e-spec.ts` is the tenant-isolation reference).
- Focused run inside the dev stack: `docker compose -f docker-compose.dev.yml exec api npx jest <file-pattern>`.
- Full suite: `npm run test:docker`. Build: `npm run build:api`.
