## 1. Trusted lifecycle boundary

- [x] Extend writer registration with exact locked lifecycle state/version.
- [x] Add a strict authenticated reader bound to room/current writer generation.
- [x] Add a renewable local lease that fails closed and cannot reopen speech.

## 2. Local tool runtime

- [x] Implement exactly five strict typed capabilities with 150 ms deadlines.
- [x] Add serialized deterministic commit/close, replay, races, and bounded
      idempotency.
- [x] Add per-turn budgets, duplicate/recursive prevention, privacy-safe
      telemetry, and typed fallback.

## 3. LiveKit integration

- [x] Wire five public pinned `function_tool` descriptors and `max_tool_steps=3`.
- [x] Scope bounded same-handle continuation to tool mode only.
- [x] Preserve opaque completion identity and canonical delivery commit.
- [x] Keep both exact server flags disabled in every environment.

## 4. Tests and evidence

- [x] Cover schemas, authority, failures, timeouts, stale/raced mutations,
      lifecycle, deadline, budgets, continuation, interruption, and fallback.
- [x] Add provider-free tool-selection and no-loop benchmark controls without
      changing the accepted SAV-467 baseline artifact.
- [x] Update contracts, decision, operations, intake, and engineering memory.
- [ ] Complete the full validation/security matrix, open a ready PR, and monitor
      hosted checks to a terminal result without merging.
