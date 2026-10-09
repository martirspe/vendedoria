---
name: vendedoria-ui
description: Polish VendedorIA's Angular console, marketing and tenant store UI using shared design-system components, brand tokens and reusable action patterns. Use for page layouts, templates, styles, components, icons, sticky CTAs, UX states, accessibility and responsive work in apps/web, apps/store or packages. Not for backend-only changes or a general security audit.
---

# VendedorIA — UX/UI and design system

Improve the requested surface with a coherent, production-ready interface. Extend the existing system when needed; do not give each feature its own controls or visual identity.

## Context and authority

- Read the nearest `AGENTS.md` and identify the surface: console (light, dense), marketing (brand presentation), or buyer store (tenant identity).
- Consult the affected rows in `docs/DESIGN-SYSTEM.md`. Executable tokens and components define actual values and APIs; `PROJECT CONSTITUTION.md` defines product/brand constraints. Follow repository conflict handling when documentation disagrees with code.
- `docs/UX-UI-MASTER-SYSTEM.md` preserves the user's full UX/UI brief. Read only the relevant headings; section 75 supplies the Design System Matrix protocol. Do not load the complete prompt for a local change.
- Inspect the affected feature, one comparable view, `packages/ui/index.ts`, relevant tokens and global styles. Read API implementation only when frontend contracts cannot resolve the data shape.

## Choose the workflow

| Request | Reference to read |
| --- | --- |
| Polish a section, form, list or dashboard | [Section polish](references/section-polish.md) |
| Add or standardize controls, cards, dropdowns, FAQs, icons, tokens or sticky actions | [Shared system](references/shared-system.md) |
| Verify a UI change and report evidence | [Verification](references/verification.md) |
| Improve buyer-store funnels and templates | [Commerce conversion](commerce-conversion.md) |
| Audit responsive behavior across the application | [Responsive audit](responsive-audit.md) |

For a section using existing controls, read section polish and verification. Read shared system when a gap requires extending the design system. Load other references only for their applicable mode.

## Essential contracts

- Search → reuse → compose → extend → define → implement → validate → reuse. Check existing `ds-*`, console utilities and tokens before adding anything.
- Put reusable visual contracts in `packages/ui` and `packages/design-tokens`; keep feature styles for domain layout. Do not create local colors, spacing scales, radii, shadows or z-index conventions.
- Consume `--ds-*` on console/marketing and `--store-*` on the tenant store. Preserve store themes and merchant customization; shared architecture does not mean identical surface styling.
- Use the installed Tailwind integration and static classes. Do not introduce a UI library or a second icon system.
- Use `ds-icon` and its typed registry. For missing Lucide icons update `scripts/sync-icons.mjs` and run `npm run icons:sync`; keep official brand SVGs in the existing brand registry. Use Manrope for UI and Satoshi for display.
- Compose quick and primary actions with `ds-action-bar`; use `ds-save-bar` for form saving. Follow the DSM's sticky placement, brand, sizing and projection contracts rather than copying a bar into each page.
- Preserve handlers, permissions, native form behavior and domain validation. A visual change does not authorize modifying payment flows, tenant boundaries or external messaging behavior.
- Show page-shaped loading, actionable empty states, recoverable errors and clear operation feedback wherever applicable. Never display failed loading as empty data.
- Keep copy in production Spanish and tied to actual behavior. Distinguish SaaS plan payments from buyer order payments. No dummy controls, speculative metrics or promised unavailable capabilities.
- Use native controls, labels and visible focus; honor reduced motion and shared touch-target tokens. Preserve critical actions on mobile.

## Completion

Deliver the implemented change with appropriate builds, meaningful interaction checks and available rendered evidence. Update the DSM when shared contracts change and the changelog for product-relevant changes. Report what changed, why, verification results and specific remaining gaps. Do not claim visual or accessibility verification from compilation alone.
