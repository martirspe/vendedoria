# Shopify parity continuation

Working evidence: `docs/SHOPIFY-PARITY-REPORT.md` (2026-10-07). User authorized implementation from the master test protocol, with priority on security and commerce. Preserve the existing untracked technical document. No live provider messages, transactions, deployment, commit or push performed.

Completed: current DB membership enforcement for business JWT; authorization regressions; HTTP/YAML dependency patches; awaited saved-cart Buy Now behavior in Classic/Stride/Selecta; storefront unit-test setup; CI unit gates and npm ci; real E2E membership fixtures; stockless validation ordering. Docker API 359 unit + 108 E2E pass, store 4, console 77, theme 11 + runtime 5. All app builds have passed; Docker is the reliable store build environment.

Next implementation slice:

UX follow-up requested by the user: console catalog/order list, product editor and order detail improvements are implemented. The create dialog now submits from its actual button, with subtotal preview and integer quantity validation. Final console verification: 90 tests and web build pass. Evidence and remaining visual coverage limits are in `docs/CONSOLE-UX-AUDIT.md` → 2026-10-07 follow-up and continuation. This closes the targeted catalog/orders pass, not the complete admin/editor browser matrix.

1. Inventory role requirements and mutations in `tenants`, `catalog`, `orders` against executable checks and relevant constitution sections. Confirm actual AGENT capabilities with real memberships before declaring or fixing gaps. Add regression tests for confirmed authorization violations.
2. Assess deepmerge-ts/Prisma fix compatibility. Final production audit has 3 high findings from one dependency chain. Avoid blanket force upgrades; test configuration merge behavior, generation and migrations.
3. Extend CI with isolated PostgreSQL E2E if that remains compatible with repository secrets-free CI setup.
4. Establish explicit contracts and acceptance cases for shared customer/cart identity across storefront and agent; do not infer that order contacts or sales memory already provide it.
5. Continue editor/admin/theme browser matrix and provider sandbox validation. Keep external actions within the user's actual authorization.

Do not rerun every passing suite without a relevant new change. Use the report's command/evidence table as baseline, and update it with new outcomes rather than erasing prior unresolved failures. No numeric parity score until a testable denominator exists. Remove this temporary continuation plan when its scope is completed.
