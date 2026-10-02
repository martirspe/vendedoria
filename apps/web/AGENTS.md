# apps/web — Angular console + marketing

Global rules live in the root `AGENTS.md`. UI/design-system work: `vendedoria-ui` skill.

## Structure
- `src/app/core/api/*-api.service.ts`: one HTTP service per API domain (`HttpClient` + `firstValueFrom`, base URL from `environments/`). Console response types are declared in these services; only store types live in `packages/contracts`.
- `src/app/core/auth/`: guard, interceptor (JWT + refresh), auth API.
- `src/app/features/<feature>/<name>.page.{ts,html,scss}`: one routed page per feature, lazy routes in `app.routes.ts`.
- `src/app/layout/console-shell.layout.*`: console shell (sidebar, Ctrl+K palette).
- SSR: every route is `RenderMode.Prerender` (`app.routes.server.ts`); pages must not depend on per-request server data, and browser-only APIs need platform guards.

## Angular conventions (match existing pages)
- Standalone components, `ChangeDetectionStrategy.OnPush`, `inject()`, signals/`computed`; `effect()` only when unavoidable.
- Built-in control flow (`@if`, `@for` with `track`, `@switch`, `@defer`); no NgModules, no `*ngIf`/`*ngFor`.
- Separate `templateUrl`/`styleUrl` files; no inline styles; no `any`; strict TypeScript.
- RxJS only for real streams (router events, realtime); HTTP calls are awaited as promises like the existing services.
- Filters that are counted, cleared or deep-linked live in the URL query params (inbox and orders already do this).

## Surfaces
- Marketing (`features/marketing`): dark brand surface, SEO metadata, performance first.
- Console (`/app/*`): light, dense, operable; every page has loading, empty, error and success states.

## Verify
- `npm run build:web` (also what `npm run lint` runs for web).
- `npm run test -w @vendedoria/web` (Vitest; coverage is minimal, so add a spec when logic is non-trivial).
