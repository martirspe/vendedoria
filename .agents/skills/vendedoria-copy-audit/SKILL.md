---
name: vendedoria-copy-audit
description: Audits and fixes every user-visible text of VendedorIA (console, marketing, tenant store, emails, API error messages, SEO metadata) so it is production-ready Spanish with no development guidance, internal jargon, placeholders, roadmap notes, mock/simulator wording or local URLs. Use when the user asks to revisar textos, copy, microcopy, "textos listos para producción", "quitar textos de desarrollo", "sin textos de guía", or before a production release.
---

# VendedorIA — production copy audit

Goal: a buyer or merchant never reads text written for developers. Fix the copy in place; keep behavior, routes and layout unchanged.

## Use when
- Release preparation, or the user reports texts like "smoke", "mock", "roadmap", "Revisa la API", "enum", "waitlist".
- After features built quickly with placeholder or internal copy.

## Inputs
- Scope: whole app (default) or one surface: console (`apps/web` `/app/*`), marketing (`apps/web` `features/marketing`), store (`apps/store`, every template), API messages (`apps/api`), emails.

## Minimal context
- Voice and honesty rules: `PROJECT CONSTITUTION.md` → only the copy/tone and UX quality headings (find with `rg -n "^#" "PROJECT CONSTITUTION.md"`).
- Rules and rewrite patterns: [reference.md](reference.md).
- Do not read business logic beyond what a string needs to stay truthful (e.g. whether a feature really exists).

## Hard rules
1. User-visible text in Spanish (Perú, tú). Code, identifiers and logs stay English.
2. Honest copy: never promise a channel, integration, human support or payment method that is not live. Remove or reword unfinished features instead of describing their internals.
3. Keep flow A ("tu plan") and flow B ("pago del cliente") distinct in wording.
4. Merchant-editable content (store texts, `templateContent`/`templateDraft`, template defaults in `selecta-copy.ts` and classic `home.page.ts`, product data) is tenant data: fix only shipped defaults, never tenant rows, unless the user asks.
5. Dev-only states may stay technical only when the code proves they never render in production (e.g. gated by `NODE_ENV`, mock provider only when credentials are empty and production refuses it). Otherwise they need production copy.
6. Do not rename routes, i18n keys, CSS classes or API fields to "fix" copy. No layout redesign.
7. Legal pages (`apps/store/src/app/features/legal`) change only through the `legal-digital-peru` skill.

## Workflow

```
- [ ] 1. Run the scanner and save the hit list
- [ ] 2. Read each surface's templates for issues the scanner cannot see
- [ ] 3. Classify every hit: fix / keep (with reason) / needs product decision
- [ ] 4. Rewrite in place, surface by surface
- [ ] 5. Re-run the scanner; builds for touched apps
- [ ] 6. Report
```

### 1. Scan (triage, not proof)
```bash
node .agents/skills/vendedoria-copy-audit/scripts/scan-copy.mjs            # web + store + api
node .agents/skills/vendedoria-copy-audit/scripts/scan-copy.mjs apps/web/src --json
```
Levels: `high` (dev jargon, instructions, placeholders, local URLs), `medium` (unfinished/roadmap, internal tone), `low` (English API exception messages). Expected false positives: `placeholder=""` example values are fine when realistic; server logs are skipped.

### 2. Manual pass per surface
The scanner misses tone and meaning. Read, per surface:
- Console: page headers, empty/error/success states, banners, pills, drawers, the Ctrl+K palette, help page.
- Marketing: hero, pricing, FAQs, `<title>`/meta descriptions in routes and `index.html`.
- Store: every template (`features/*` classic and `templates/<name>/`), status pages in `apps/store/src/server.ts`, SEO service defaults, emails sent to buyers.
- API: exception messages that reach the UI (check the console/store error mappers first: a generic mapped message means the API text is not shown).
- Emails: subject, preheader, body, footer.

### 3–4. Fix
- Prefer the rewrite patterns in [reference.md](reference.md). Keep strings short; one idea per message; actionable errors ("Inténtalo de nuevo" + what the user can do).
- Error copy must not blame "la API", "el servidor" or ask users to check consoles, logs, `.env` or Docker.
- Unfinished integrations: show "Próximamente" only if the product wants a teaser; never internal words (waitlist interna, adapter, enum, dominio, smoke path).
- When a hit is a real product decision (hide a card vs. teaser), pick the conservative option (hide or neutral teaser) and list it under "Decisions".

### 5. Verify
- Scanner again: zero `high` left, or each remaining one justified in the report.
- `npm run build:web` and/or `npm run build:store`; `npm run build:api` if API messages changed. Run `npm run test -w @vendedoria/web` and API jest when a spec asserts a changed string.
- Spot-check key screens in the browser when the dev stack is up (console `http://localhost:4201`, store `http://{slug}.localhost:4300`).

## Output format
```markdown
## Copy audit
Scope: …

### Fixed
| Surface | File | Before | After |
| --- | --- | --- | --- |

### Kept (justified)
- `file:line` — why it is fine in production

### Decisions for the product owner
- …

### Verification
- scanner: before N high → after 0 high
- builds/tests run + result
```

## Avoid
- Translating code identifiers, log messages or comments.
- Rewriting legal texts outside `legal-digital-peru`.
- Marketing superlatives or competitor names; inventing features, prices or delivery times.
- Mass reformatting of templates while editing strings.
