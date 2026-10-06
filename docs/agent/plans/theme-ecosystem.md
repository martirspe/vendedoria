# Theme ecosystem execution plan

Scope: API storefront, console store/editor, store renderers, contracts, shared theme catalog, isolated Docker tests. Existing working tree was clean. Docker is active; use the installed Docker Desktop CLI with sandbox escalation.

## Discovery / decision (before code changes)

- Three shipped presentations: `classic` (Clásica), `selecta` (Selecta), `stride` (Impulso). Identity is the persisted English slug, not the Spanish display name.
- Reuse business services, SSR/host resolution, signed preview, plain-text/image sanitization, shared blocks, per-theme layouts, editor history, scheduled publication and transactional content snapshots.
- Current API `store-templates.ts` and console `TEMPLATE_OPTIONS` duplicate registration. No manifest, installed release, compatibility gate or release migration exists.
- Template selection currently mutates the live row immediately. Content draft/snapshot does not capture the selected presentation. Publishing claims `updatedAt`; saving can overwrite another session.
- Schemas union built-in fields to preserve content across themes. Keep this compatibility layer; do not create independent cart/checkout implementations.
- Demos are isolated static catalogs with disabled transactions; preserve that boundary. Demo import will copy editorial content/preset to a draft, never fabricate real inventory or reviews.
- Implement a dependency-free shared declarative catalog, immutable release identity, renderer contract, capability validation and sequential declarative migrations. Reviewed compiled renderers remain platform-owned; merchant packages cannot execute code.
- Add additive installed/draft release columns and snapshot identity. Legacy rows pin to 1.0.0; new 1.1.0 releases expose additional customization without changing defaults. Updates/switches stage to draft, preview, then publish. Retain older releases.
- Add reusable token application, favicon/footer configuration, generic catalog-driven theme management, validation/starter tooling, lifecycle/isolation tests and permanent architecture/audit docs.

## Execution

1. Record initial audit and official-source benchmark in `docs/THEMES-AUDIT.md`.
2. Shared catalog/contracts/validator and starter.
3. Additive persistence migration and server lifecycle gates.
4. Registry-driven console and renderers; theme selection/update/import/recovery UX.
5. Isolated lifecycle E2E, unit regression, all builds, frontend tests, rendered responsive checks.
6. Permanent `docs/THEMES.md`, changelog and verification evidence; remove this temporary plan when complete.

No commits, deployment, production access or merchant data deletion are part of this request.
