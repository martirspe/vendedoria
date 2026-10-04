# Catalog information and bounded retrieval

- Keep existing local work; implement physical, digital and service forms and type-specific readiness.
- Add guided use cases, exclusions, compatibility, returns and digital access/license details across DTO, console, public contracts and agent facts.
- Search the full tenant catalog with a PostgreSQL GIN text-search index. Retrieve bounded candidates and preserve explicit conversation/cart references. Reuse the indexed search in the public store.
- Remove the whole-catalog LLM index. Bound the product context and history, select relevant detail blocks without cutting critical conditions, and require recommendations to come from retrieved facts.
- Require digital delivery configuration and snapshot fulfillment on order lines so later catalog edits/deletion preserve paid access.
- Preserve service coordination semantics; do not promise bookings without an agenda.
- Verify API/web/store builds, focused unit tests and isolated database e2e, including a 10,000-product search fixture and query-plan evidence. Document actual results and limits.
