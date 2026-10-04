# packages — Shared design system and contracts

Global rules live in the root `AGENTS.md`. These packages are consumed through tsconfig path aliases (`@vendedoria/ui`, `@vendedoria/contracts`) and SCSS `@use`; they have no build step of their own.

- `ui/`: standalone `ds-*` Angular components (`ds-button`, `ds-empty-state`, `ds-icon`, `ds-turnstile`) exported from `ui/index.ts`. Used by `apps/web` and `apps/store`, so changes must build in both.
- `ui/src/icon/ds-icon.component.ts`: the only icon source. `DS_ICONS` (`ui/src/icon/ds-icons.ts`) holds the SVG nodes of the Lucide icons in use, generated from `@lucide/angular` by `npm run icons:sync`; never import `Lucide…` components in apps (each one ships its own compiled template). Add an icon by mapping its Design System name to the `Lucide…` name in `scripts/sync-icons.mjs` and running the script; brand logos go into `DS_BRAND_ICONS` as the brand's official SVG path. Never add another icon library.
- `design-tokens/tokens.scss`: canonical `--ds-*` tokens (brand primary `#C8F542` must not change without explicit approval). `design-tokens/storefront.scss`: overridable `--store-*` theme for tenant stores.
- `contracts/index.d.ts`: type-only contract of the public store API, shared by `apps/api/src/storefront` and `apps/store`. Changing it means updating both sides in the same change.

Verify: `npm run build:web` and `npm run build:store` (plus `npm run build:api` for contract changes).
