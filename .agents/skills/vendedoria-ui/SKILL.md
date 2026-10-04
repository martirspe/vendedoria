---
name: vendedoria-ui
description: UI workflow for VendedorIA's Angular console, marketing pages and tenant store — design-system reuse (ds-* components, --ds-*/--store-* tokens, ds-icon registry), required UX states, Spanish copy, a11y and mobile-first checks. Use when editing .html/.scss or presentational code in apps/web or apps/store, creating pages/components, adding icons or tokens, or when "UI", "diseño", "estilos", "componente", "pantalla", "responsive" or "accesibilidad" appear.
---

# VendedorIA — UI & design system

## Use when
- Creating or changing pages, components, templates or styles in `apps/web` or `apps/store`.
- Adding a design-system component, token or icon in `packages/`.

## Inputs
- Surface: marketing (dark brand), console (light, dense), store (buyer-facing, tenant theme).
- Feature folder and the API data it renders.

## Minimal context
Start with:
- The feature folder (`.page.ts/.html/.scss`) and one sibling page with a similar layout.
- `packages/ui/index.ts` (available `ds-*` components) and `apps/web/src/styles.scss` (global `.ds-empty`, `.ds-page-shell`).
- Tokens: `packages/design-tokens/tokens.scss` (search for the token you need; do not read it whole). Store: `packages/design-tokens/storefront.scss`.

Do NOT open API code unless the data shape is unclear from the `core/api` service types.

## Invariants
- Reuse before creating: `ds-button`, `ds-empty-state`, `ds-icon`, global `.ds-*` classes. A pattern needed in 2+ places goes into `packages/ui` (or global styles) first, then into the feature.
- No literal colors, spacing, radii, shadows or z-index in features: only `var(--ds-*)` (console/marketing) or `var(--store-*)` (store).
- Icons only through `ds-icon`; add missing Lucide icons to the map in `scripts/sync-icons.mjs` and run `npm run icons:sync` (regenerates `DS_ICONS`), and brand logos as official SVG paths in `DS_BRAND_ICONS` (`packages/ui/src/icon/ds-icon.component.ts`).
- Fonts: Manrope (UI) and Satoshi (display) already declared; do not add Inter/Roboto or web-font CDNs.
- Every touched data view has loading (page-shaped), actionable empty, recoverable error and success feedback.
- Copy in Spanish, honest: no promises of human support from AI, no unconnected channels; distinguish "tu plan" (flow A) from "pago del cliente" (flow B).
- Accessibility: real `<button>`/`<a>`, labels on inputs, visible focus, touch targets ≥ `--ds-touch-target`, `prefers-reduced-motion` respected.
- Mobile first; critical console actions (reply, takeover, reactivate agent, payment status) available on mobile.
- No dead UI: no CTAs, chevrons or headings without real destinations.
- Buyer store work: apply [commerce-conversion.md](commerce-conversion.md) for template funnels, production Spanish, cross-view hierarchy and checkout on one page. Keep each template's identity and merchant edits; conversion claims need measurement.
- Whole-app responsive work: apply [responsive-audit.md](responsive-audit.md). Include public pages, authentication, console navigation and every shipped store template; distinguish rendered evidence from source review.

## Procedure
1. Identify surface and read the constitution section only if needed: `DESIGN SYSTEM FIRST`, `IDENTIDAD VISUAL`, `CALIDAD UX 2027` (find with `rg -n "^#" "PROJECT CONSTITUTION.md"`).
2. Compose from existing DS pieces; extend `packages/ui` when a reusable piece is missing.
3. Wire states (loading/empty/error/success) with signals.
4. Check responsive behavior at mobile and desktop widths.
   For a whole-app request, use the responsive reference's route/device matrix and preserve all critical actions at every breakpoint.
5. Store templates: review discovery → product → cart → checkout → confirmation in every shipped template; report observed results and unavailable verification separately. Use the commerce reference's acceptance matrix.

## Verification
- `npm run build:web` and/or `npm run build:store` (both when `packages/` changes).
- Visual check with the dev stack: console `http://localhost:4201`, store `http://{slug}.localhost:4300`. Use a browser tool for screenshots when available.
- Grep the diff for hex/rgb literals and `px` spacing in feature `.scss` files.

## Definition of Done
- No hardcoded design values; DS reused or extended.
- All four states present; Spanish copy; a11y basics; mobile verified.

## Avoid
- Copying patterns between console and marketing/store surfaces.
- One-off components that duplicate DS responsibilities.
- New UI libraries (Material, Bootstrap, icon packs).
