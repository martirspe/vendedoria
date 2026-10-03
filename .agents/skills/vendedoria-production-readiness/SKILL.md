---
name: vendedoria-production-readiness
description: End-to-end production readiness pass for the whole VendedorIA app — baseline verification, dead and legacy code cleanup, security audit with fixes, production copy audit, production configuration review (env, Docker, nginx, payments, email, Meta, SEO) and a final go/no-go report. Orchestrates vendedoria-dead-code-cleanup, vendedoria-security-audit and vendedoria-copy-audit in a safe order. Use when the user asks to "dejar listo para producción", "analizar el app completo", "preparar el release", go-live, pre-launch checklist, or wants cleanup + security + copy in one pass.
---

# VendedorIA — production readiness

Goal: a release candidate that builds, passes tests, has no dead/legacy code, no known security gaps, no development copy, and a production configuration that matches the code. The output is a go/no-go report plus the fixes.

## Use when
- Before the first production deploy or any major release.
- The user asks for a full-app analysis covering cleanup, security and texts together.

## Inputs
- Scope: whole repo (default) or a subset of phases.
- Constraints from the user (time box, "report only", phases to skip).

## Minimal context
- Root `AGENTS.md`, each app's `AGENTS.md`.
- Phase skills (load each only when its phase starts):
  - `.agents/skills/vendedoria-dead-code-cleanup/SKILL.md`
  - `.agents/skills/vendedoria-security-audit/SKILL.md`
  - `.agents/skills/vendedoria-copy-audit/SKILL.md`
- Production configuration checklist: [reference.md](reference.md).
- README "Producción", `docker-compose.yml`, `Dockerfile`, `docker/nginx/`, `.env.production.example` for phase 5.

## Hard rules
1. **Order matters**: cleanup → security → copy → configuration. Removing dead code first shrinks the attack and copy surface; copy goes after security because fixes may add messages.
2. **Each phase ends green**: builds and tests pass before the next phase starts. Never stack unverified changes.
3. **Separate commits per phase** when committing is requested (`chore: remove dead code`, `fix(security): …`, `fix(copy): …`, `chore(prod): …`). Do not commit unless the user asks.
4. **Product decisions are surfaced, not taken silently**: hiding a feature, changing payment behavior, making env vars required, rotating secrets, forcing logout. Pick the conservative default only when it is reversible and list it under Decisions.
5. Global invariants from `AGENTS.md` always apply (tenant isolation, flows A/B, no secrets/PII, minimal coherent change, no new dependencies without approval).
6. Never deploy, push or touch the production server from this skill; deployment is a separate, explicit request (`README` "Producción", user skill `vps-docker-deploy` if available).

## Workflow

```
- [ ] Phase 0 — Baseline and inventory
- [ ] Phase 1 — Dead & legacy code      (vendedoria-dead-code-cleanup)
- [ ] Phase 2 — Security audit & fixes  (vendedoria-security-audit)
- [ ] Phase 3 — Production copy         (vendedoria-copy-audit)
- [ ] Phase 4 — Production configuration (reference.md)
- [ ] Phase 5 — Final verification
- [ ] Phase 6 — Go/no-go report
```

### Phase 0 — Baseline
- `git status` (note pre-existing uncommitted work; do not mix it into phase changes without saying so).
- Dev stack up (`npm run dev`); `npm run build:api`, `npm run build:web`, `npm run build:store`, `npm run test:docker`, `npm run test -w @vendedoria/web`.
- Low-memory Docker hosts: run builds sequentially in a one-off container with web/store dev servers stopped (`docker compose -f docker-compose.dev.yml run --rm --no-deps deps sh -c "npm run build:web"`), then restart them with `docker start` (avoid `docker compose start`, which reruns the `deps` service and `npm ci` under running servers).
- Record baseline failures; they are reported, not silently fixed in a later phase.

### Phases 1–3
Follow each phase skill completely, including its report. Carry forward: Deferred items, Decisions, verification results.

### Phase 4 — Configuration
Walk [reference.md](reference.md): env validation vs `.env.production.example`, payments, Meta, email, Docker/nginx, SEO/robots, observability, data/backups. Fix code/config gaps in the repo; list server-side actions (values to set, secrets to create) as Deploy actions without touching real secrets.

### Phase 5 — Final verification
All builds, `npm run test:docker`, web Vitest, copy scanner (`node .agents/skills/vendedoria-copy-audit/scripts/scan-copy.mjs`) with zero unjustified `high`, `npm audit --omit=dev` summary. Optional when resources allow: `docker compose -f docker-compose.yml build` to prove production images build.
Smoke the main journeys on the dev stack: register/login, publish a product, store home → product → cart → checkout (mock or test credentials), order page, console orders, WhatsApp simulation.

### Phase 6 — Report
`CHANGELOG.md` → `[Unreleased]` updated for user-visible changes. Then:

```markdown
# Production readiness — <date>
Verdict: GO / GO with conditions / NO-GO

## Summary
- Dead code: N removed, N deferred
- Security: P0 x fixed / P1 … ; residual risks
- Copy: N strings fixed; 0 high scanner hits (or justified)
- Config: N fixes; N deploy actions

## Blockers (NO-GO until resolved)
## Decisions for the product owner
## Deploy actions (server/env, no secret values)
## Deferred (with owner/reason)
## Verification (commands + results)
```

Verdict rules: any open P0/P1, failing build/test, or required production setting without a value plan → NO-GO. Open P2/P3 or decisions with a safe default → GO with conditions.

## Avoid
- Running phases in parallel on the same files.
- Broad refactors, framework upgrades or redesigns under the "readiness" label.
- Declaring GO without the verification evidence in the report.
