---
name: vendedoria-review
description: Diff-scoped code review for VendedorIA that checks only the invariants a change can break — tenant isolation, money flows A/B and idempotency, webhook signatures, PII, contracts between api/store, design-system tokens, UX states, verification evidence. Use when asked to review a diff, branch, PR or uncommitted changes ("revisa", "review", "code review", "antes de mergear"). Not for implementing fixes unless asked.
---

# VendedorIA — review

## Use when
- Reviewing uncommitted changes, a branch or a PR before merge.

## Inputs
- Diff source: `git diff`, `git diff <base>...HEAD`, or the PR.

## Minimal context
- Start from the diff only. Open full files only around changed hunks, plus direct callers/callees when a signature or contract changed.
- Read the local `AGENTS.md` of each touched surface. Load `vendedoria-security` or `vendedoria-data` only if the diff touches their paths.
- Do not review untouched modules or re-audit the whole repo.

## Procedure
1. `git diff --stat` to map touched surfaces; classify each file: api / web / store / packages / prisma / infra.
2. Run the checklist below only for categories present in the diff.
3. Check verification evidence: were the builds/tests in `vendedoria-implement` → Verification run for each touched surface? If not and you can run them, run them.
4. Report findings ordered by severity.

## Checklist
- **Isolation**: every new query/endpoint scopes by authenticated `tenantId` or store host; child models accessed through a scoped parent; no `tenantId`/slug from client input.
- **Auth**: new `@Public()` routes justified and self-verified; no guard bypass.
- **Money**: flow A/B not mixed; amounts in integer cents; state transitions guarded; webhook side effects after signature check and DB-enforced idempotency.
- **Data**: migration present for schema changes; no edited applied migrations; destructive SQL flagged; indexes for new access paths.
- **Contracts**: `packages/contracts` + `storefront-mapper.ts` + store consumers changed together; console API service types match DTOs.
- **Validation**: DTOs with class-validator for every new input (global pipe forbids unknown fields).
- **Secrets/PII**: no secrets, tokens or real `.env` values; no logging of chats/phones/emails; new env vars in both `.env*.example`.
- **AI**: sales agent reads catalog truth for price/stock; fallback when no LLM key; manual operator message pauses the agent.
- **Frontend**: standalone + OnPush + signals + control flow; no `any`; tokens only; `ds-icon` only; loading/empty/error/success; Spanish copy; a11y; SSR-safe browser APIs in `apps/web` (prerender).
- **Scope**: no unrelated refactors, renames, formatting churn or new dependencies.
- **Docs**: `CHANGELOG.md` `[Unreleased]` updated for product-relevant changes.

## Output format
- Findings: `severity (blocker/major/minor) — file:line — problem — concrete fix`.
- Then "Verification": what ran, result, what could not run.
- No praise, no restating the diff. If nothing is wrong, say so in one line.

## Definition of Done
- Every touched category checked; each finding actionable and located.

## Avoid
- Style nitpicks already handled by Prettier/ESLint.
- Suggesting architecture changes outside the diff's scope (mention once as optional at most).
