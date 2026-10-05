---
name: vendedoria-ai-sales-engine
description: "Implement, maintain, diagnose or evaluate VendedorIA's stateful AI Sales Engine: durable WhatsApp/Instagram turns, conversation state and customer memory, authoritative tools, Qdrant retrieval and sales guardrails. Use for agent context loss, repeated questions, product grounding, references or runtime quality; exclude merchant coaching and TikTok LIVE-specific work."
---

# VendedorIA AI Sales Engine

Evolve the existing buyer-facing runtime incrementally. The LLM reasons and writes; the backend owns facts, tenant context, state, permissions and commerce. Prioritize precision, coherence and sales progression before latency and cost.

## Locate the implementation

Resolve the VendedorIA repository from the current workspace; do not assume a machine-specific path. Read root/API AGENTS instructions and only relevant constitution sections through `vendedoria-implement` routing. Read `docs/AI-SALES-ENGINE.md` for architecture/operations, then affected source and direct tests. Executable code wins over proposals. Preserve unrelated local changes.

For a fresh implementation or a requirements audit, read only the relevant headings in [references/mission.md](references/mission.md), which preserves the original user specification. Do not rerun the entire mission for a narrow maintenance request.

Paths relative to repository root:

- `apps/api/src/conversations/sales-gateway.service.ts`: inbox, debounce, outbox and delivery.
- `apps/api/src/agent-runtime/sales-lock.service.ts`: ownership-safe Redis lease plus mandatory PostgreSQL fence.
- `sales-state.ts`, `sales-memory.service.ts`, `sales-context.ts`: versioned state, explicit sourced facts, summaries and context budgets.
- `sales-agent-runtime.service.ts`, `sales-agent-tools.service.ts`, `sales-tool-registry.service.ts`: existing orchestration and authoritative commerce/read tools.
- `sales-search.service.ts`, `knowledge/knowledge.service.ts`: semantic IDs, current DB hydration and published knowledge.
- `sales-response-validator.ts`, `sales-evaluation.ts`: grounding/known-question guardrails and annotated metrics.
- Prisma `SalesEngineTurn`, `SalesCustomerMemory`, `SalesSearchJob`, `Conversation.salesState`, `Message.inboundKey/enginePending`; migrations also contain transactional indexing triggers.
- `docs/agent/evals/sales-engine.json`, `scripts/evaluate-sales-engine.cjs`: reproducible offline evaluation; gateway/provider integration lives in `apps/api/test/sales-engine.e2e-spec.ts`.

## Invariants that guide changes

- Tenant comes from JWT or backend-resolved channel/host, never model arguments. Apply it to DB parents, Redis keys and Qdrant filters, then validate payload IDs again through PostgreSQL.
- Qdrant returns candidates. PostgreSQL supplies current product/variant availability, price, stock, delivery rules and order/payment status. Do not cache transactional facts or embed digital access URLs.
- A conversation executes under the PostgreSQL fence even with a healthy Redis lease. Release/renew Redis only for its owner. Before commerce/send, check the fence and operator pause. Keep pool capacity compatible with worker concurrency.
- Persist inbound idempotency and `STARTED` before side effects. Commit `READY`, state and inbox consumption with conditional status transitions. `SENDING` without confirmation is uncertain; never replay it or an interrupted commerce action blindly. Preserve enough diagnostics for human reconciliation.
- Human messages/templates pause the agent. Handoff preserves context and reason; reactivation is explicit. Playground has separate state and no production orders.
- Customer facts require explicit source, timestamp, confidence, scope and expiry where appropriate. Do not turn ambiguous sizes, negations or inferred preferences into confirmed facts. Conversation requirements are distinct from lasting customer memory.
- Preserve ordered product presentations and rejected choices across recent-window eviction. Missing/deactivated IDs cannot shift an ordinal onto another product. Never substitute a different variant silently.
- Read tools accept a finite DTO/schema and unknown fields fail. The model cannot execute SQL, arbitrary writes, discounts or tenant SaaS charges. Existing backend services control buyer orders/payments.
- Keep critical state/tools intact under the context budget; drop whole low-priority turns. Incremental summaries need not consume a separate LLM call. Personality cannot override universal grounding or tenant policies.
- Validate prices against the correct product, variants/stock against current evidence, policies/shipping against published facts and questions against known answers. A fallback must remain truthful. Do not label deterministic regex coverage as universal hallucination detection.
- Index outbox updates must commit/rollback with product/FAQ changes, including imports/deletion. Exclude price/stock-only changes from paid re-embedding. Backfill is tenant-scoped, paginated and restartable; provider outages use structured retrieval.
- Logs/metrics contain IDs, timings, outcomes, token counts and error codes; never chats, phones, credentials or provider response bodies. Annotated evaluation metrics keep denominators and report unavailable samples as null.

## Implement and verify

For broad evolution, write a brief code-based audit and phased plan before edits, then implement rather than stopping at documentation. Reuse existing catalog, shipping, knowledge, orders, payment providers, personality and Redis connection. Additive migrations must preserve history; never edit applied migrations or mutate production infrastructure without authorization.

Use `vendedoria-data` and `vendedoria-security` when their domains change. Add operational settings through existing env validation and both example files. Record product changes in CHANGELOG and update architecture/operations when behavior changes.

Prefer the running project's Docker containers. Generate Prisma, build affected apps, run the narrow regression/evaluation cases, then the isolated DB suite for persistence/isolation changes. `npm run eval:sales -w @vendedoria/api` runs the offline dataset after the API build. Broaden tests for contracts/config as repository instructions require. Do not read secrets to obtain test connections; use the known isolated Docker database and synthetic provider responses.

Report what was implemented, migrations/config, executed evidence, actual gaps and deployment prerequisites. Distinguish fixtures/embeddings stubs from real model evaluation. Do not push, merge, deploy, send real customer messages or run a production backfill merely because a development implementation is requested.
