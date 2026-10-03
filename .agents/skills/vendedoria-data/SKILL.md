---
name: vendedoria-data
description: Prisma/PostgreSQL workflow for VendedorIA — schema changes, migrations in the Docker dev stack, tenant-scoped queries, money/idempotency columns and the isolated test database. Use when editing apps/api/prisma/schema.prisma or migrations, adding models/fields/indexes, writing non-trivial Prisma queries, or when "migración", "schema", "Prisma", "índice" or "base de datos" appear.
---

# VendedorIA — data

## Use when
- Adding/changing models, fields, enums, relations, indexes or unique constraints.
- Creating or fixing migrations, or debugging migration state.
- Writing Prisma queries that cross tenants, aggregate, or touch child models.

## Inputs
- Desired data change and the API domain that owns it.

## Minimal context
Start with:
- `apps/api/prisma/schema.prisma` (only the models involved)
- `apps/api/prisma/migrations/` (directory listing; open only the latest migration)
- The owning service: `apps/api/src/<domain>/<domain>.service.ts`

Do NOT open frontend apps unless an API response shape changes.

## Invariants
- Tenant-owned root models carry `tenantId` (`SalesAgent`, `KnowledgeFaq`, `JourneyTemplate`, `Channel`, `Product`, `Conversation`, `PlaygroundSession`, `Order`, `Payment`, `Storefront`). Child models (`ProductVariant`, `ProductMedia`, `Message`, `OrderItem`, `PlaygroundMessage`) have no `tenantId`: query them through a tenant-scoped parent, never by bare id.
- Every read/update/delete by id also filters by `tenantId` (`findFirst({ where: { id, tenantId } })`, not `findUnique({ where: { id } })` followed by trust).
- New tenant-owned models get `tenantId` + an index starting with `tenantId`; per-tenant uniqueness is `@@unique([tenantId, ...])`.
- Money columns are `*Cents` Int, never Float/Decimal.
- External event idempotency is enforced by a DB unique key (e.g. `Payment.idempotencyKey`, `Channel @@unique([tenantId, type, externalId])`, `Conversation @@unique([channelId, externalThreadId])`), not by in-memory checks.
- Refresh tokens are stored hashed (`RefreshToken.tokenHash`); passwords with bcrypt. Never store raw secrets or tokens in new columns without encryption decision from the user.
- Never edit or renumber an applied migration. History was squashed into `0001_init` before the first production customers; new changes go in new migrations after it.

## Procedure
1. Edit `schema.prisma` minimally, following neighbouring naming (camelCase fields, PascalCase models, `createdAt`/`updatedAt`).
2. Create the migration inside the dev stack: `docker compose -f docker-compose.dev.yml exec api npx prisma migrate dev --name <snake_case_name>`.
3. Review the generated SQL: destructive changes (drop/rename column, type narrowing, NOT NULL without default on populated tables) require explicit user approval before applying.
4. `npm run prisma:generate` if the host needs regenerated types, then update services/DTOs.
5. Production applies migrations via the `migrate` service in `docker-compose.yml` (`prisma migrate deploy`); never rely on `migrate dev` or `db push` there.

## Verification
- `npm run build:api`.
- `npm run test:docker` (runs `prisma migrate deploy` on the isolated `vendedoria_test` DB, then unit + e2e). Development data is untouched.
- For isolation-sensitive changes, extend or mirror `apps/api/test/storefront-isolation.e2e-spec.ts`.

## Definition of Done
- Migration SQL reviewed and committed alongside the schema change.
- All new queries tenant-scoped; indexes match the new access paths.
- No destructive migration applied without approval.

## Avoid
- `prisma db push`, `migrate reset` on the dev database, or editing `migration_lock.toml`.
- Reading `.env` to discover connection strings (use `.env.example` / compose files).
- Adding PostGIS or geo features (out of product scope).
