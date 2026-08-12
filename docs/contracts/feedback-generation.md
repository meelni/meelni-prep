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

Eligibility depends on the frozen canonical candidate evidence, not room
duration or total transcript-turn count. One trustworthy reviewable candidate
answer is enough to request feedback. A response is reviewable when it passes
the existing quantitative gates and either the strict scoreable language
surface or the qualitative-only long-form recognized-evidence boundary. That
fallback requires at least 40 tokens, recognized occurrences no denser than
30% and no more than twice the distinct recognized-lexeme count, at least one
strong connector-linked pair of different recognized lexemes within 14 token
positions, and either five distinct lexemes with two broad linked pairs or at
least 46 tokens with four distinct lexemes and one broad linked pair. Five
distinct strict scoreable answers permit the full-depth evaluation state;
smaller healthy prefixes and fallback-only evidence remain partial.
Duration and turn statistics remain diagnostic evidence only and cannot deny
feedback.

Numerical feedback requires at least four strict scoreable candidate answers. A
healthy eligible prefix below that precision boundary uses the scoreless
`feedback.evidence-limited.v2` result. Its provider contract contains no
freeform narrative, quote, number, score, grade, or confidence field. The
provider may select only closed PM-rubric signal/action codes and candidate
turn aliases supplied in the request. The core parser validates every alias
against the frozen canonical candidate evidence, then resolves the codes to a
finite server-owned observation, next-step, dimension, confidence, and summary
template map. It restores the exact frozen turn text as the citation; provider
text is never copied into that citation. The resolved result persists two or
three findings and never persists or presents inferred scores. Unknown codes,
empty arrays, repeated signal codes, repeated action codes even when their
references differ, duplicate or invalid references, extra strings, or any
malformed selection remain `generation_failed`, not candidate insufficiency.
Signal identity is unique within strengths or improvements, and action identity
is unique across both arrays. Distinct strength and improvement selections may
cite the same frozen candidate turn so one-answer feedback remains useful.

A frozen session with no trustworthy reviewable candidate answer becomes
`no_reviewable_answer`. A degrading marker, writer gap, degraded settlement, malformed
canonical boundary, or detected transcript corruption becomes
`transcript_integrity_degraded`. Neither state calls the feedback provider.
Provider refusal, invalid generated output, timeout, and other evaluator
failure remain the distinct `generation_failed` outcome.

The marker rule is role/reason scoped: the exact
`interviewer/no_provider_confirmed_prefix` marker records textless inaudible
interviewer speech and does not degrade independent candidate evidence.
Candidate markers and every `canonicalization_failed` marker still fail closed.
A preserving marker or missing runtime settlement is frozen with the durable
`evidence_limited_only` feedback-mode constraint. This keeps the evaluator in
partial scoreless mode even when four or five strict scoreable answers are
otherwise present. The Python runtime uses the same exact role/reason rule, so
the preserving marker alone does not manufacture a degraded settlement.

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
- Transcript evidence is normalized through the Feedback v2 trust boundary before evaluation.
- Evidence-limited results use the same canonical frozen-transcript trust
  boundary, but the provider supplies only closed codes and candidate aliases;
  all customer-visible coaching copy and citations are server owned.
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

Retired direct-generation endpoints remain explicit `410 Gone` tombstones. Legacy direct database writers are removed; read APIs remain compatible with stored Feedback v1 and Feedback v2 records.
