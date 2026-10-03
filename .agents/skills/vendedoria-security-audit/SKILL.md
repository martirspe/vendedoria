---
name: vendedoria-security-audit
description: Whole-application security audit of VendedorIA that verifies existing controls and fixes gaps in priority order — tenant isolation (IDOR), auth/JWT and @Public routes, Meta and Mercado Pago webhook signatures and idempotency, money flows A/B, PII in logs and responses, injection/XSS/SSRF/open redirects, uploads, rate limits, secrets and env validation, CSP/CORS/headers, dependency CVEs and production-only config. Use when the user asks for auditoría de seguridad, security audit, huecos de seguridad, hardening, OWASP, "listo para producción" security, or before a release. For editing a single flow use vendedoria-security; for a diff use vendedoria-review.
---

# VendedorIA — security audit & fixes

Goal: every threat class below ends as **Fixed**, **Already OK** (with file evidence) or **Deferred** (with reason and owner). Fix, do not just report, unless the user asked for report-only.

## Use when
- Release preparation, after large features, or the security phase of `vendedoria-production-readiness`.

## Inputs
- Scope: full stack (default) | api | console | store | money | auth | channels.
- Limit agreed with the user (e.g. "P0–P1 only"), if any.

## Minimal context
- `vendedoria-security` skill → Invariants (authoritative rules for auth, webhooks, money, store).
- Threat map with concrete paths and checks: [reference.md](reference.md).
- Read code per threat class; do not open UI styling or marketing.

## Hard rules
1. **Verify before inventing**: search for the existing guard, signature check, rate limit or validation first. Never add a second control next to a working one.
2. **Fix in priority order** (P0 → P3). Minimal patch per finding, with a test when a regression would reopen auth, isolation or money.
3. **No secrets**: never read `.env*` (only `*.example`), print env values, or commit keys. Findings cite file paths, never values.
4. **No offensive content**: no exploit payloads or attack walkthroughs in code, comments or reports; describe the weakness and the fix.
5. **Ask before**: forcing logout of all users, rotating secrets, deleting data, breaking a public API/webhook contract, making a new env var required in production (it can block the next deploy), or changing payment behavior.
6. Security-only changes; no refactors or UX polish unless the fix needs them.

## Priority

| P | Class | VendedorIA examples |
| --- | --- | --- |
| P0 | Secrets exposure, auth bypass, cross-tenant access | Prisma query by id without `tenantId`; `@Public()` route without own verification; tenant/slug taken from client input; secrets in repo or logs |
| P1 | Money integrity | Webhook side effects before signature check; replay/double apply; client-sent amounts or status trusted; mock/simulate endpoints reachable in production; flow A and B mixed |
| P1 | PII leaks | Phones, emails, chat text in logs, errors or over-fetched API responses; tokens in URLs or logs |
| P2 | Injection / XSS / SSRF / redirects | `innerHTML`/`bypassSecurityTrust*`, unescaped email HTML, raw SQL, server fetch of user URLs, open redirects, unsafe uploads |
| P2 | Abuse | Missing `@RateLimit` on anonymous sensitive endpoints; human forms (login, sign-up, checkout) without `@Turnstile` or production without `TURNSTILE_*` keys; unbounded list/size/pagination; AI cost abuse |
| P3 | Hardening | Headers/CSP/CORS, cookie flags, token storage, dependency CVEs, Swagger exposure, container user, error verbosity |

## Workflow

```
- [ ] 1. Scope + baseline (builds, npm run test:docker)
- [ ] 2. Inventory each threat class against existing controls (reference.md)
- [ ] 3. Fix P0, then P1, P2, P3 (or mark Already OK / Deferred)
- [ ] 4. Tests for each fixed P0/P1 (isolation, signature, idempotency, rate limit)
- [ ] 5. Verify builds/tests; CHANGELOG for user-visible security behavior
- [ ] 6. Report with residual risk
```

### 2. Inventory
Walk the threat map in [reference.md](reference.md) in order. For every item record: control location (`path:line`) or "missing". Useful sweeps:
- `rg -n "@Public\(\)" apps/api/src` → each route verifies signature, preview token or host itself.
- `rg -n "findUnique\(|update\(\{ where: \{ id|delete\(\{ where: \{ id" apps/api/src` → each preceded by a tenant-scoped lookup.
- `rg -n "innerHTML|bypassSecurityTrust|DomSanitizer" apps/web/src apps/store/src`.
- `rg -n "\$queryRaw|\$executeRaw" apps/api/src` → parameterized template tags only.
- `rg -n "logger\.|console\.(log|error)" apps/api/src` → no bodies, phones, emails, tokens.
- Dependencies: `npm audit --omit=dev` in the dev stack (`deps` container); fix Critical/High in direct deps with the smallest version bump, otherwise Deferred with reason.

### 3. Fix
- Isolation: scope by `tenantId` from `@CurrentUser()` / store host; child models through a scoped parent. Add a case to `apps/api/test/storefront-isolation.e2e-spec.ts` (or a sibling e2e) for each fixed IDOR.
- Webhooks: verify with `timingSafeEqual` before any side effect; reject when the secret is configured and does not match; in production, a missing secret must fail closed (or be reported as Deferred with the deploy impact).
- Production-only gates: mock payment pages, simulate endpoints and dev redirects must be unreachable when `NODE_ENV=production`.
- New anonymous sensitive endpoint → `@RateLimit(bucket, perMinute)`; if a human submits it from a form, also `@Turnstile(action)` + `ds-turnstile` (see `vendedoria-security`).
- New env var → `env.validation.ts` + both `.env*.example` with placeholders.

### 5. Verify
`npm run build:api` (+ web/store if touched) and `npm run test:docker`. Re-run the sweeps for fixed classes.

## Output format
```markdown
## Security audit
Scope: …

| P | Status | Finding | Evidence | Action |
| --- | --- | --- | --- | --- |
| P0 | Fixed / Already OK / Deferred | … | `path:line` | … |

## Changes made
- …

## Deploy notes
- env vars now required, secrets to rotate, behavior changes

## Residual risk
- …

## Verification
- commands + results
```

## Avoid
- Weakening CSP, CORS or the store proxy allow-list to make something work.
- Disabling rate limits or signature checks in tests outside `NODE_ENV=test`.
- Reporting theoretical issues without checking the code path; reporting "Already OK" without a file reference.
