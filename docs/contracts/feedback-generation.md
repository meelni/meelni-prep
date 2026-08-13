# Feedback Generation

Feedback generation is one idempotent workflow with durable dispatch and generation state stored on the session's single feedback row. API routes and Inngest functions are adapters; they do not write feedback results directly.

## State ownership

- Interview completion creates the row as `pending` or terminal `skipped` and commits the completion tier and dispatch state in the same transaction.
- The dispatcher is the only owner of `dispatchStatus`, `dispatchEventId`, attempts, and dispatch leases.
- The generation workflow is the only writer of generation status and evaluated feedback fields.
- Completed and skipped rows are immutable. Recovery never reopens them.

The feedback row also stores one content-free `outcome_reason` from the closed
taxonomy `feedback_generated`, `no_reviewable_answer`,
`transcript_integrity_degraded`, `dispatch_failed`, or `generation_failed`.
Dispatch failures are transient and clear when a later claim succeeds. The
completed and skipped outcome reasons remain immutable with their terminal row.

## Evidence-gated evaluation

Eligibility depends on frozen canonical candidate evidence, not room duration
or transcript-row count. One trustworthy usable candidate answer is enough to
request evaluation. Deterministic gates may reject empty/filler-only audio,
corruption, injection, or bounded-source overflow, but punctuation and surface
grammar never prove PM competence or numerical precision. Duration and turn
statistics remain diagnostic only.

Canonical rows are grouped deterministically into
[candidate answer blocks](./answer-blocks.md) after transcript preparation.
Evidence classification runs once per logical candidate response, and
completion statistics count bound prompt groups plus answer blocks rather than
STT-final rows. Equivalent speech split into 1, 2, 5, or 10 adjacent finals must
preserve statistics, completion tier, provider input, coverage, scores, mode,
citations, and persisted evaluation content. The evaluator receives only the
derived answer blocks. Canonical source-event provenance remains the server-
only integrity authority.

New evaluations use
[`feedback.dimension-coverage.v1`](./dimension-evidence-coverage.md). The
provider selects only closed round-specific rubric facets and supplied answer-
block aliases. Core derives `sufficient | partial | absent` coverage, sparse
dimension scores, the result mode, exact evidence text, and any overall score.
Numerical scores require sufficient rubric-facet coverage, not a number of
strict scoreable answers. Legacy completed v2 and evidence-limited v2 rows keep
their existing immutable read paths.

A frozen session with no trustworthy reviewable candidate answer becomes
`no_reviewable_answer`. A degrading marker, writer gap, degraded settlement,
malformed canonical boundary, conflicting replay continuity, detected
transcript corruption, or a non-exact replay-family omission that affects
candidate evidence or prompt binding becomes `transcript_integrity_degraded`.
Neither state calls the feedback provider.
Provider refusal, invalid generated output, timeout, and other evaluator
failure remain the distinct `generation_failed` outcome.

The marker rule is role/reason scoped: the exact
`interviewer/no_provider_confirmed_prefix` marker records textless inaudible
interviewer speech and does not degrade independent candidate evidence.
Candidate markers and every `canonicalization_failed` marker still fail closed.
A preserving marker or missing runtime settlement is frozen with the durable
`evidence_limited_only` feedback-mode constraint. New evaluation may still
record grounded facet coverage, but core forces `coaching_review` with all
scores and overall absent. The Python runtime uses the same exact role/reason
rule, so the preserving marker alone does not manufacture degradation.

## Event fencing

Every dispatch attempt receives a distinct event ID. A worker may claim only a `pending` or `failed` row whose stored event ID exactly matches its event. Completion, skip, and failure are compare-and-set updates requiring all of:

1. the session ID;
2. `status = processing`;
3. the exact stored event ID.

A delayed provider response or failure callback from an older attempt therefore cannot overwrite a newer attempt or a terminal outcome.

## Retry and leases

Generation has a five-minute processing lease. Recovery may prepare only `failed` work or `processing` work whose lease is missing or expired. Preparation returns the row to `pending`, clears processing and dispatch lease timestamps, and marks dispatch failed so the dispatcher can allocate a fresh event ID.

Pending dispatches, failed dispatches, and expired sending leases can be dispatched. Active generation and active sending leases report `retryable: false`. Terminal results always report `retryable: false`.

Concurrent recovery calls are safe: preparation is conditional, dispatch claim is atomic, and callers converge on sent or in-progress state.

## Authorization and side effects

- The workflow verifies the session owner and exact event identity before transcript or provider work.
- Transcript evidence is normalized through the canonical trust boundary and
  SAV-369 answer-block derivation before evaluation.
- Dimension-coverage provider output is closed to facet codes, block aliases,
  and nullable scores. Coverage, mode, overall, evidence text, and summary are
  server derived.
- Insights are requested only after the completion compare-and-set applies. The insights event ID is stable for the session and generation event, so replay does not create a second update.
- A terminal session missing its feedback row can be repaired through the interview-completion workflow before dispatch.
- A session in `ending/user_end` is owned by the background end finalizer. The
  feedback API does not invoke repair while transcript settlement is in
  progress.
- A pending account-deletion tombstone blocks repair, evaluation, terminal writes, and downstream insights. Recovery reports the session as unavailable rather than recreating work.
- Recovery requires the completion tier committed during interview finalization. Missing legacy evidence is a non-retryable failure; it is never promoted to `full` by default.

## Client recovery contract

`GET /api/feedback/:sessionId` owns retry truth through its top-level
`retryable` field. A persisted failed dispatch crosses the read query and API
as the typed provider-neutral `dispatch_failed` lifecycle response; the core
decoder preserves it and the UI presents a queue retry without provider
details. Feedback clients do not infer recovery from nested dispatch state.
Missing feedback is retryable only for terminal sessions. Ending
sessions return `settling` and `retryable: false`; active sessions remain
`session_not_ended` and non-retryable.

Each mounted feedback client may automatically invoke authenticated `POST` recovery once when top-level `retryable` is true. Concurrent polls share that attempt, then continue within a 30-poll, three-second interval budget. A failed automatic attempt becomes an explicit user recovery action rather than an unbounded POST loop.

When that bounded GET budget is exhausted, the client enters an explicit local
paused presentation. It removes the spinner and busy claim, states that
automatic checking has paused, and keeps both `Check again` and Interview
History available. `Check again` is read-only: it performs one decoded GET and
starts at most one new bounded GET window. It never treats the refresh itself
as recovery authorization or issues a POST. If the refreshed top-level
response is retryable, the UI may expose a separate recovery action. A late
terminal response renders in the mounted client without reloading the browser
document.

An owned active session links back to its canonical
`/interview?sessionId=<session-id>` route. Feedback recovery never depends on
browser history state.

Every GET, recovery POST, and terminal refresh payload crosses the same runtime lifecycle decoder. Unknown statuses or malformed variants render an explicit unavailable state; they never fall through to an indefinite loading state.

Transient GET transport failures (network errors, timeouts, rate limits, and
server 5xx responses) do not cross the lifecycle decoder. The client keeps the
saved-interview status visible and continues bounded GET polling. A transient
error payload therefore cannot be misreported as an unsupported lifecycle
response. Non-retryable HTTP failures and malformed successful responses still
render an explicit unavailable state.

Deadline-ended interviews whose room cleanup has not been acknowledged return `settling` with `retryable: false`. Clients poll that state only with `GET`; neither automatic nor manual recovery can dispatch feedback until cleanup settles.

Eligible user-ended feedback is dispatched before room cleanup and credit
convergence. Production evaluation requests cap output at 2,000 completion
tokens, use a 75-second SDK timeout, and disable SDK-level retries. Durable
worker retries own subsequent attempts so one provider call cannot silently
double the latency tail.

## Compatibility

Retired direct-generation endpoints remain explicit `410 Gone` tombstones.
Legacy direct database writers are removed; read APIs remain compatible with
stored Feedback v1, Feedback v2, and evidence-limited v2 records without
rewriting them.
