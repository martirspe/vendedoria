# Whole-app responsive acceptance

Use with VendedorIA UI and commerce-conversion. This is an acceptance procedure, not a promise that one browser represents every device.

## Inventory and risk

Read the app routes and relevant styles; inventory marketing/legal, authentication/invites/results, console features, full-screen editor and both store funnels. Group common shells but check each feature's own layout. Prioritize checkout, payment status, message reply/handoff, navigation, publishing and forms. Preserve permissions, merchant customization, tenant isolation and existing API contracts.

## Viewport matrix

- Narrow phone: 320 CSS pixels; typical phones: 360 and 390.
- Tablet: 768; landscape/compact desktop: 1024.
- Desktop: 1440; wide desktop: 1920.
- Short landscape viewport: 844 × 390 for overlays, editor and payment controls.
- Reflow equivalent to 200% desktop zoom: 720 CSS pixels. Test actual browser zoom, keyboard and screen-reader semantics when supported; a width emulation alone does not certify them.

Check breakpoints immediately above and below the layout transition when a defect is found. Use the actual measured viewport, not the requested size, as evidence. Reload only disposable fixture pages if browser viewport emulation needs it.

## Layout and interaction gates

1. The document has no horizontal overflow. Wide data tables may scroll inside a labelled/focusable container; they must not force the whole document wider.
2. Grid/flex children shrink with `min-width: 0`. Adaptive card grids use a lower bound capped at available width: `minmax(min(100%, <minimum>), 1fr)`. Don't hide defects with global `overflow-x: hidden`.
3. Inputs use legible text, visible labels and useful autocomplete/inputmode. Touch actions meet `--ds-touch-target`. Long text wraps; essential prices, totals, errors and buttons remain readable.
4. All navigation destinations and subnavigation remain operable on mobile. Horizontal navigation stays inside its own scroll area. Editor device previews remain reachable on tablet/phone.
5. Dialogs/drawers account for short/dynamic viewport height, scrolling and keyboard visibility. Check dismissal, focus and return to the invoking control. Fixed help/CTA controls respect safe areas and never cover consent, error or payment controls.
6. Preserve mobile messaging and order management actions; don't remove essential functionality at a breakpoint. Desktop side-by-side views become useful stacked views with clear reading order.
7. Store typography uses shared hierarchy tokens, grouped spacing and consistent card anatomy. Each template may keep its typography/personality while maintaining readable body/caption/control sizes.
8. Reduced motion, visible focus, semantic headings, labelled inputs and status/error announcements remain functional. Don't rely exclusively on hover, color or visual order.
9. Keep store identity visible in every footer, including checkout. Verify a real loaded logo and the monogram fallback; wide logos must shrink without pushing header navigation outside the viewport. Floating controls must not cover legal links when the footer enters view.
10. Filters share one desktop row whenever their content fits. Let controls wrap by available space on phones, without removing labels or choices. Measure the section's effective margin plus padding and the gap above pagination; keep one stylesheet owner for each refined layout.

## Evidence and fixtures

Use browser rendering of compiled/current code. Record route, template, viewport, measured client/scroll widths and observations. Capture representative desktop/mobile screenshots. Render data-rich, empty, error and loading views where appropriate; explicitly record coverage gaps rather than treating an error page as validation of the loaded feature.

Use synthetic accounts, catalog, orders and an isolated payment simulator. Do not log real PII, read secrets, charge live payment methods, create real business records or bypass host/CSP/auth controls. Fixture authentication must exist only in temporary local QA infrastructure; never add bypasses to product code.

## Deliverable

Fix observed defects, run affected builds and narrow relevant tests, then write a report with: inventory, device matrix, hierarchy/copy decisions, concrete corrections, rendered/static coverage, test results and pending checks. Do not claim exhaustive device/browser certification or conversion lift without evidence. Keep the reusable skill aligned with the implementation.
