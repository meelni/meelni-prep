# Design: Shadow feedback execution and comparison

## Authority direction

Scheduling recomputes SAV-441 over a validated terminally frozen evidence
snapshot. Only `complete` and `verified_prefix` projections produce intents.
Evaluation rereads the snapshot and exact-matches the intent to the current
projection before exposing one answer block to an injected evaluator. Event
history contains only UUIDs, closed versions, timestamps, and SHA-256
fingerprints; transcript, answer, prompt, provider, and raw-error content never
enters an event or report.

SAV-441 has no pre-terminal authority. Reported timing is therefore limited to
a post-freeze potential lead and is unavailable unless batch and shadow
timestamps share the same terminal freeze anchor. This change cannot prove
during-interview latency savings and does not change LiveKit/runtime behavior.

## Structural default-off composition

`MEELNI_SHADOW_FEEDBACK_EXECUTION` mints a module-private capability only for
the exact value `enabled`. The production parser accepts no override. Every
handler verifies that capability and the independent SAV-445 storage
capability before a database read/write, Inngest send, evaluator call,
comparison read, or operational emission. Disabled, malformed, and forged
contexts return before dependency access.

The production Inngest functions are provider-neutral. A runtime descriptor
and evaluator are injected into handler factories for tests, but the registered
application composition supplies no live evaluator or model/provider
configuration. Enabling environment values alone cannot make a paid call.

## Replay and external execution boundary

Intent, event, function, step, and evaluator idempotency keys derive from the
immutable SAV-445 exact key. The evaluator function uses per-key concurrency,
an exact read before work, and separate memoized evaluation/persistence steps.
Completed work and step-complete crash replays do not repeat physical fake
evaluation, while immutable insert resolves acknowledgement-loss replays.

No generic workflow can prove universal exactly-once behavior when an external
provider completes but the caller loses the response before its durable step
commits. A future provider adapter must honor the supplied idempotency key. A
process-independent lease or provider receipt would be a separate storage
decision and is not added here.

Every exact read, send, physical call, and persistence boundary rechecks the
deletion tombstone and exact owner/freeze anchor. An already-started external
request cannot be cancelled reliably; when deletion begins during that call,
its output is discarded before persistence.

## Content-free batch comparison

A dedicated read adapter selects only completed dimension-coverage authority
and immediately maps answer-block references to SAV-441 fingerprints in
memory. Evidence prose never leaves the adapter. The pure comparator emits
only bounded aggregate counts for artifact state, facet/mode/score agreement,
closed failures, tokens, estimated cost, and post-freeze timing.

The report has no transcript, answer, prompt, evidence text, provider payload,
request ID, raw error, user/session ID, artifact key, or arbitrary string. It
does not persist to a product table or flow through feedback, insights,
billing, UI, or interview ownership.

Comparison starts from the authoritative terminal batch-completion signal and
uses an event-anchored 90-second wait matching the SAV-444 policy horizon. It
performs at most nineteen direct exact-set reads with replay-stable five-second
durable sleeps, recalculating the remaining time after each asynchronous fence.
Failed artifacts are terminal; only missing artifacts are polled. Timeout
produces an incomplete report and never affects batch completion.

## Compatibility

Migration 0039 and its privacy lifecycle are reused unchanged. Final batch
feedback remains authoritative, including SAV-440 verified-prefix behavior.
Removing the new functions or leaving either capability disabled is a complete
rollback for this default-off seam.
