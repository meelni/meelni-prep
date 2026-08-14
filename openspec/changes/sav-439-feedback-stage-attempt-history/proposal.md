# SAV-439 feedback stage-attempt history

## Why

The feedback row preserves authoritative terminal truth, while the existing
aggregate event is intentionally best-effort. Neither provides a durable,
replay-safe explanation of which generation stage ran, retried, failed, or was
fenced. Persisting raw event IDs or open provider diagnostics would create a
new identity/content path, and awaiting an operations write inside every stage
would make telemetry part of the 90-second product budget.

## Outcome

The service attempts one bounded, content-free batch of feedback-generation
operations after the authoritative workflow outcome. Every row accepted by
storage is durable, fenced to the exact generation event through a versioned
SHA-256 value, closed over stage, outcome, failure, timing, and provider
context, and immutable under exact replay. A delayed or unavailable recorder
cannot change whether feedback evaluation or persistence succeeds.

## Boundaries

- The raw feedback dispatch event remains transient and is used only to lock
  and fence the authoritative feedback row before hashing.
- Attempt rows contain no user, session, room, question, transcript, answer,
  evidence, feedback, raw error, provider payload, or provider request ID.
- The workflow buffers attempts and performs one bounded post-outcome batch
  flush. Completion after the bound is not guaranteed in a terminating
  serverless invocation. The existing attempt event remains best-effort
  aggregate fallback evidence, not exact-event/joinable history.
- The ledger does not alter generation deadlines, retry ownership, settlement
  authority, feedback eligibility, terminal state, or read behavior.
- The table is service-only, additive, RLS-forced, account-erased, and exercised
  with provider-free fixtures. No UI, alert, Production, deployment, or provider
  action is included.
