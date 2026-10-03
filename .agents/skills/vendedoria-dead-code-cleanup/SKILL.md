---
name: vendedoria-dead-code-cleanup
description: Finds and removes dead and legacy code across the VendedorIA monorepo (NestJS api, Angular console and store, shared packages, scripts, docs) without changing product behavior — unused exports, orphaned pages/components/routes, unreachable branches, obsolete flags, duplicate helpers, stale styles, dependencies nothing imports and docs pointing at removed code. Use when the user asks for limpieza, código muerto, dead code, legacy cleanup, prune unused, quitar lo que no se usa, or as the cleanup phase of production readiness.
---

# VendedorIA — dead & legacy code cleanup

Goal: delete what nothing reaches; keep every route, API contract, copy, permission and money flow identical.

## Use when
- Whole-repo or per-surface cleanup, or the cleanup phase of `vendedoria-production-readiness`.

## Inputs
- Scope: whole repo (default) | one app/package | named paths.

## Minimal context
- Root `AGENTS.md` + the local `AGENTS.md` of each app in scope.
- Detection commands, protect list and VendedorIA legacy map: [reference.md](reference.md).
- Do not read the constitution unless a deletion would remove a visible feature (then stop and ask).

## Hard rules
1. **Prove unused before deleting**: no static import, no route/lazy import, no template selector, no Nest provider/module reference, no string-based lookup, no script/Docker/CI usage, no test asserting it. "Looks old" is not evidence.
2. **No behavior change**: same URLs (including redirects), API responses, Swagger contract, emails, store payloads (`packages/contracts`), sales-agent behavior.
3. **Protect list first** ([reference.md](reference.md)). Anything on it needs explicit user approval to remove.
4. **Never** edit applied Prisma migrations, drop columns in this skill (schema cleanup goes through `vendedoria-data` with a migration and approval), touch secrets, prod volume names or deploy scripts "for cleanup".
5. **Dependencies**: remove a package only when nothing imports it in any workspace and no config/CLI uses it; update `package-lock.json` through npm in the Docker stack (`deps` service), never by hand.
6. **Separate from features and refactors**: no renames, no new abstractions, no formatting churn. If removing dead code requires a refactor, defer it.
7. Uncertain → keep it and list under **Deferred** with the missing evidence.

## Workflow

```
- [ ] 1. Baseline: builds + tests green before touching anything
- [ ] 2. Inventory candidates with evidence (per surface)
- [ ] 3. Check each against the protect list
- [ ] 4. Delete in batches, leaves → roots; verify after each batch
- [ ] 5. Fix docs/skills/AGENTS.md that referenced removed code
- [ ] 6. Final verification + report
```

### 1. Baseline
`npm run build:api`, `npm run build:web`, `npm run build:store`, `npm run test:docker` (dev stack up). Record failures that already exist so they are not blamed on the cleanup.
On machines with little Docker memory, run builds one at a time in a one-off container with the dev servers stopped (`docker compose -f docker-compose.dev.yml run --rm --no-deps deps sh -c "npm run build:web"`).

### 2. Inventory
Run the detectors in [reference.md](reference.md) → "Detection". For each candidate write: path/symbol, evidence of no use, risk. Typical classes:
- Unused exports, files never imported, private methods never called.
- Pages/components not reachable from `app.routes.ts` (web/store) or any template.
- API endpoints no client calls — **only** delete if not public/webhook/Swagger-documented for external use; otherwise Deferred.
- Branches always false (flags never set, env vars absent from `env.validation.ts` and every `.env*.example`).
- Duplicate helpers (keep the one used by the design system / core services).
- SCSS selectors with no matching template class; global styles for removed components.
- Scripts in `scripts/`, `apps/api/scripts/` not referenced by `package.json`, README or Docker, and not a documented manual tool.
- Docs describing removed behavior.

### 3–4. Delete safely
Order: styles/helpers → components/pages → routes/modules/providers → dependencies → docs.
After each batch: build the touched apps (and `npm run test:docker` when api code changed). Revert the batch on any failure you cannot attribute to the baseline.

### 5. Docs
Update `AGENTS.md` files, `.agents/skills/*`, `docs/agent/context-map.md`, README when they mention removed paths. Add `CHANGELOG.md` → `[Unreleased]` → "Removed" only if something user-visible or a public endpoint went away.

## Output format
```markdown
## Cleanup summary
Scope: …   Baseline: builds ✓/✗ · tests ✓/✗

### Removed
- `path` or `symbol` — evidence (0 imports / unreachable route / flag never set)

### Kept intentionally
- `path` — protect-list reason

### Deferred
- `path` — missing evidence or needs product decision

### Verification
- commands + results
```

## Avoid
- Deleting tests that document contracts (tenant isolation, webhook signatures, idempotency).
- Removing defensive validation because it "looks redundant".
- Removing legacy URL redirects (e.g. Selecta legacy URLs) that emails, ads or the sales agent may still link to.
- "Modernizing" Angular/Nest code while cleaning.
