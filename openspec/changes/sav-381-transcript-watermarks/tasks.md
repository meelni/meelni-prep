# Tasks

- [x] Audit current runtime sequence, ingest, settlement, finalizer, and feedback-read paths.
- [x] Validate LiveKit event/metrics and data-packet assumptions against official docs.
- [x] Define complete, partial, insufficient, and degraded evidence states.
- [x] Add and backfill durable writer progress with database constraints.
- [x] Advance progress atomically for turn, marker, replay, and gap healing.
- [x] Freeze terminal session and per-writer evidence cutoffs atomically.
- [x] Consume only the frozen evidence prefix during feedback generation.
- [x] Add replacement, reconnect, gap, degradation, replay, and legacy fixtures.
- [x] Update contracts, migration operations, observability, and Linear evidence.
- [x] Run focused, broad, migration, lint, typecheck, and build verification.
