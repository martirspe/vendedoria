# Conversion engines

- Add tenant-scoped conversion settings, recovery carts, delivery outbox and consented behavior events (additive migration).
- Recovery: explicit per-channel consent, Turnstile/rate limits, signed tenant-bound capabilities, current catalog validation, database delivery claims, BullMQ retries and durable reconciliation. Stop at order reservation or opt-out; expire/delete buyer data.
- Recommendations: tenant-scoped purchase co-occurrence, consented browsing/category affinity, optional Qdrant feature vectors and Redis candidate cache; always hydrate current prices/availability. No geolocation or invented proof.
- Shared Angular recovery/recommendation components across Classic, Selecta and Stride; same-origin proxy allow-list; authoritative checkout unchanged.
- Validate API/web/store builds, unit/security tests and Docker integration when available. Document activation and delivery uncertainty limits.
