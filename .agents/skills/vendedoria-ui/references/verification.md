# UI verification and evidence

Select checks based on the affected behavior and surface. Follow nearest repository instructions for canonical commands.

## Source and build checks

- Review the diff for local visual values, duplicate shared responsibilities and broken consumers. Prefer `rg` scoped to affected files; a literal-value match is a review prompt, not proof that domain layout is wrong.
- Build `apps/web` for console/marketing and `apps/store` for store work. Build both when shared UI/tokens change: `npm run build:web` and `npm run build:store`.
- Run the narrowest meaningful existing tests. Add interaction tests when changing state, form semantics or reusable component behavior; do not add tests that merely assert static styling or mirror implementation.
- Verify callbacks, submits, disabled/busy transitions, error recovery, form dirty state and relevant keyboard interactions. Expand testing only when failures or cross-surface changes justify it.
- Check whitespace and patch integrity with `git diff --check`. Do not run autofixing lint across unrelated files merely to verify a UI edit.

## Rendered review

With permitted browser tools and the active Docker stack, review the relevant route at representative mobile and desktop widths. Console development is normally at `http://localhost:4201`; store development uses the configured tenant host, typically `http://{slug}.localhost:4300`. Confirm configuration when those addresses differ.

Inspect page hierarchy, spacing, text wrapping, contrast, clipping and overflow. Exercise focus, dropdowns, disclosure, errors and the main action without sending real messages, placing orders or changing live settings solely for visual verification.

For sticky actions, scroll the actual container and check top/bottom placement, safe area, wrapping, navigation overlap and keyboard access. Screenshots help visual review; compilation and DOM tests cannot establish sticky behavior, contrast or mobile layout by themselves.

If browser access or another check is unavailable, continue independent permitted checks and report the exact evidence gap. Respect tool restrictions rather than changing access mechanisms to bypass a block. Do not claim visual acceptance or full WCAG compliance without the corresponding evidence.

## Completion record

Record the concrete change, affected consumers, commands/results and material warnings. Separate rendered observations, interaction-test results and source-only conclusions. Update `docs/DESIGN-SYSTEM.md` for changed shared APIs/tokens and `CHANGELOG.md` for product-relevant behavior. Keep any existing section audit or progress record current when the task uses it.
