# Feedback Generation

Feedback generation is one idempotent workflow with durable dispatch and generation state stored on the session's single feedback row. API routes and Inngest functions are adapters; they do not write feedback results directly.

## State ownership

- Interview completion creates the row as `pending` or terminal `skipped` and commits the completion tier and dispatch state in the same transaction.
- The dispatcher is the only owner of `dispatchStatus`, `dispatchEventId`, attempts, and dispatch leases.
- The generation workflow is the only writer of generation status and evaluated feedback fields.
- Completed rows are immutable. Skipped rows are terminal except for the
  exact owner-scoped late false-negative recovery described below.

The feedback row also stores one content-free `outcome_reason` from the closed
taxonomy `feedback_generated`, `no_reviewable_answer`,
`transcript_integrity_degraded`, `dispatch_failed`, or `generation_failed`.
Dispatch failures are transient and clear when a later claim succeeds. The
Completed outcome reasons remain immutable. A skipped integrity outcome may
change only through the fenced false-negative recovery transition below.

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
block aliases. Core derives `sufficient | partial | absent` coverage, the
closed result mode, exact evidence text, and any overall score. Numerical
scores require sufficient rubric-facet coverage for every weighted dimension,
not a number of strict scoreable answers. Incomplete weighted coverage reduces
to all-null Coaching review; core never renormalizes or zero-fills a total.
Legacy completed v2 and evidence-limited v2 rows keep their existing immutable
read paths.

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
interviewer speech. It advances the shared writer sequence but is transparent
to prompt/answer continuity: it neither closes nor splits an answer. Any number
of these exact markers may occur mid-session or at the end without globally
invalidating otherwise trusted blocks. Candidate markers and every
`canonicalization_failed` marker still fail closed, as do sequence gaps,
writer drift/degradation, malformed marker ordering, settlement/cutoff
conflicts, and conflicting replay continuity. A preserving marker or missing
runtime settlement is frozen with the durable
`evidence_limited_only` feedback-mode constraint. New evaluation may still
record grounded facet coverage. Core keeps that invocation scoreless unless
the server recomputes an exact `verified_prefix` trusted-answer projection.
That projection supersedes the legacy qualitative-only constraint only when it
is healthy, settled, gap-free, covers every candidate answer block with zero
exclusions, and all weighted dimensions are sufficient. Only then may core emit
all dimension scores plus the canonical overall. A real excluded tail or any
incomplete dimension reduces the invocation to all-null Coaching review. The
Python runtime uses the same exact role/reason rule, so the preserving marker
alone does not manufacture degradation or scoreability.

## Event fencing

Every dispatch attempt receives a distinct event ID. A worker may claim only a `pending` or `failed` row whose stored event ID exactly matches its event. Completion, skip, and failure are compare-and-set updates requiring all of:

1. the session ID;
2. `status = processing`;
3. the exact stored event ID.

A delayed provider response or failure callback from an older attempt therefore cannot overwrite a newer attempt or a terminal outcome.

## Retry and leases

Generation has a five-minute processing lease. Ordinary recovery may prepare
only `failed` work or `processing` work whose lease is missing or expired.
Preparation returns the row to `pending`, clears processing and dispatch lease
timestamps, and marks dispatch failed so the dispatcher can allocate a fresh
event ID.

A narrow late false-negative recovery may also prepare an exact persisted
`skipped/transcript_integrity_degraded` row whose original dispatch was sent.
It is available only through the authenticated owner-scoped recovery workflow,
after the immutable frozen snapshot is revalidated under the current canonical
trust boundary and produces reviewable trusted answer blocks. The transition
is a compare-and-set against that exact terminal tuple and dispatch event. It
returns the row to `pending`, conservatively retains partial completion
authority, clears processing and dispatch leases, and lets the dispatcher mint
a fresh attempt event. Concurrent calls converge on the same requeued work.
Failure to revalidate leaves the terminal skip unchanged.

Requeueing evaluates the already-consumed interview and performs no credit
debit, grant, refund, release, or other credit mutation. Recovery does not
promise a score; core must independently prove the complete Scorecard contract.

Pending dispatches, failed dispatches, and expired sending leases can be
dispatched. Active generation and active sending leases report
`retryable: false`. Terminal results report `retryable: false` except for a
skipped integrity row that has passed frozen-evidence revalidation and exposes
the bounded owner-scoped review recovery above.

Concurrent recovery calls are safe: preparation is conditional, dispatch claim is atomic, and callers converge on sent or in-progress state.

### Generation deadline and retry ownership

Each dispatched generation event has one 90-second deadline anchored to the
event timestamp. Queue delay consumes that budget. The same deadline crosses
authorization and claim, frozen-evidence preparation, provider evaluation,
response validation, and terminal persistence. Claim, completion, and skip
compare-and-set statements also require database time to remain before that
deadline, so work that finishes late cannot become authoritative.

The production provider SDK keeps `maxRetries = 0`. The workflow owns at most
three provider attempts within the shared budget, reserves five seconds for
persistence, and caps each provider request at 75 seconds. A later attempt
starts only when at least five seconds remain for the request after the
persistence reserve and any bounded `Retry-After` delay. After every durable
retry sleep resumes, the workflow recomputes that request budget from current
time; a late wakeup cannot reuse the pre-sleep timeout or start another call.

The closed provider policy retries only per-attempt timeout/abort, network,
rate-limit, and provider-capacity failures. The local per-attempt circuit
breaker is classified as a typed provider timeout and increments the same
three-attempt counter. Event-wide deadline exhaustion, authentication,
configuration, provider contract, response-validation, evidence-integrity,
and fenced failures are non-retryable. Unknown validation failures fail closed
instead of starting a second provider call.

Inngest retains two whole-function retries as the durable owner for transient
pre-provider infrastructure and persistence failures. Successful durable step
results are replayed: evaluation step IDs are stable, while the pre-evaluation
fence read includes the Inngest execution attempt and is refreshed on every
function replay. A transient persistence failure therefore retries the
compare-and-set with the memoized validated evaluation and does not call the
provider again. Policy-exhausted or permanent failures are converted to an
Inngest non-retryable error. Terminal completed or skipped feedback remains
authoritative throughout every replay.

Once an evaluator returns or records a successful provider attempt, any later
parsing, validation, or telemetry failure is closed as a non-retryable
provider-contract outcome regardless of the error's original retry
classification. It may not escape as transient infrastructure work or start
another provider attempt, because either path would repeat paid work.

Every database value returned through an Inngest step must first be projected
to an explicit JSON-safe snapshot. The generation claim exposes only the
closed completion fields needed downstream plus `processingStartedAtMs` as a
finite number. The workflow validates that primitive before provider work and
uses it for processing-duration telemetry. It never calls `Date` methods on a
step-returned value. Missing or malformed claim timing is a non-retryable
persistence-contract failure, so deterministic step serialization drift cannot
repeat a paid provider call.

`meelni_feedback_generation_attempt` version 1 records only stage, local
attempt number, outcome, closed failure class, bounded duration and remaining
budget, bounded retry delay, provider diagnostic kind/status, sanitized
model/tier labels, and validated token counts. It accepts no session, user,
question, transcript, evidence text, feedback text, raw provider payload,
provider request ID, or raw error field. Telemetry is best-effort and cannot
change workflow state.

The separate `feedback_generation_stage_attempt` table preserves service-only
stage history when a bounded post-outcome write is accepted. The raw generation
event remains transient for the feedback-row lock and exact-event comparison;
storage receives only
`v1:<sha256>` of that event. The hash is an exact replay fence, not an identity
or provider request ID. A transient event ID must already be non-empty,
bounded, and equal to its trimmed form; the fence hashes the exact accepted
bytes without normalization. The table has no user, session, room, question,
transcript, answer-block, evidence, feedback-content, provider-payload,
provider-request, or raw-error column, and direct customer roles have no grant.

`workflow_attempt` is one-indexed and always equals the zero-indexed Inngest
execution attempt plus one. `provider_attempt` is a separate nullable ordinal:
it is null for non-provider operations and 1–3 for provider request/response
operations. Operations map to one closed stage, and the compatible outcome and
failure tuple is database constrained. The closed failure classes are
`deadline_exceeded`, `transport_timeout`, `transport_network`,
`provider_rate_limited`, `provider_capacity`, `provider_authentication`,
`provider_configuration`, `provider_refusal`, `provider_schema`,
`provider_contract`, `evidence_integrity`, `fenced`, `persistence`, and
`internal`.

Completed timestamp minus started timestamp must equal `duration_ms` exactly at
millisecond precision. The duration bucket is derived and tied to its exact
range in storage. Provider diagnostic/status/model/tier/usage fields and
Retry-After are null on non-provider operations. Provider response operations
cannot carry Retry-After; provider requests may carry it only when retrying.

The latency fields have these operational meanings. Stage durations are not
summed unless the row meanings below explicitly permit it.

| Measure                        | Meaning                                                                                                                                                                                                                                                                                        | Measurement source                                                                                                                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Queue wait / retry event age   | On the first workflow execution, dispatch `requestedAtMs` to first observation is queue wait. A whole-function retry re-enters before durable steps and its later `queue_wait` row is cumulative event age, including prior work and backoff; it must not be used as queue-admission evidence. | Direct `queue_wait` row, interpreted with its workflow attempt.                                                                                                                                                             |
| Authorization                  | Active-account fence plus owned-session and exact-generation-event reads.                                                                                                                                                                                                                      | Direct `authorization` row.                                                                                                                                                                                                 |
| Claim compare-and-set          | The pending/failed-to-processing database claim, including its event and deadline predicates. This is not queue wait.                                                                                                                                                                          | Direct `claim` row.                                                                                                                                                                                                         |
| Provider request               | One provider transport attempt, ending when a response is accepted or the transport fails.                                                                                                                                                                                                     | Direct `provider_request` row reported by the evaluator, or the closed provider-stage failure row when no response was accepted.                                                                                            |
| Validation / provider response | Parsing and validating an accepted provider response. It starts at the captured successful provider-request completion, so it does not include provider transport time.                                                                                                                        | Direct `provider_response` row.                                                                                                                                                                                             |
| Persistence compare-and-set    | The terminal `complete` or `skip` database transition after the account-deletion precheck, including event and deadline predicates.                                                                                                                                                            | Direct `complete` or `skip` row.                                                                                                                                                                                            |
| Attempt processing span        | This workflow execution's observation to its last operation completion. It excludes the cumulative queue delay, and memoized provider evidence remains attached to its originating attempt.                                                                                                    | Derived by grouping one event fence and `workflow_attempt`, then measuring that attempt's `queue_wait.completed_at` to its latest operation `completed_at`; it is not an additional stored duration.                        |
| Event elapsed to attempt end   | Original dispatch request to the end of a particular workflow attempt. This is cumulative event elapsed time, so a later retry includes all prior queue and retry delay.                                                                                                                       | Derived for one event fence and `workflow_attempt` from that attempt's `queue_wait.started_at` to its latest operation `completed_at`; do not sum it with queue wait or the attempt processing span.                        |
| End-to-visible proxy           | Accepted interview end to terminal feedback application. This is a terminal-availability proxy, not browser paint or user observation.                                                                                                                                                         | Existing terminal `feedback_generation` operations timing derives `interview_session.ending_at` to the applied `complete`/`skip` time and carries the service-side session join; it does not come from summing ledger rows. |

The exact logical attempt key is idempotent only when every normalized stored
field matches. A same-key replay with a different outcome, failure, timing,
budget, environment, or provider field conflicts and cannot rewrite history.
The workflow buffers attempt inputs and invokes one batch recorder in `finally`
after authoritative product work. That recorder is isolated from synchronous
throws and bounded to 100 milliseconds; failure or non-resolution cannot
replace product state or spend the 90-second generation budget. Completion
beyond that bound is not guaranteed when the serverless invocation terminates.
The existing attempt event remains best-effort aggregate fallback evidence; it
is neither exact-event nor joinable history. Account erasure locks owned
feedback and removes attempt rows before deleting their feedback/session
parents.

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

An authenticated read of a recoverable late false-negative skip returns the
customer-safe `review_recovery_available` state with top-level
`retryable: true`. The read derives that state from the same immutable frozen
evidence revalidation required by POST; it does not infer retryability from the
old skip reason alone. Recovery retries the saved review without consuming
another credit. Credit copy remains independent: `credit_recovery_in_progress`
is emitted only while settlement is outstanding, never after a settled retain.

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

### Saved-interview processing workspace

Transient `settling`, `pending`, and `processing` GET responses may include the
optional closed projection `saved-interview.workspace.v1`. The projection is
built from the same single owner-scoped historical session/question read used
by the lifecycle request; a retired question remains valid context for its
saved session. Its complete shape is:

| Field              | Contract                                                                 |
| ------------------ | ------------------------------------------------------------------------ |
| `version`          | Exact `saved-interview.workspace.v1`.                                    |
| `saved`            | Exact `true`; it does not imply that feedback is terminal.               |
| `roundType`        | One canonical interview round type.                                      |
| `question`         | Bounded historical question text and nullable company, or `null`.        |
| `frozenTranscript` | Exact `pending`, `ready`, or `unavailable` availability, never row data. |

The projection contains no user, session, room, transcript turn, answer,
feedback result, generation event, provider field, raw error, or internal
failure code. It is customer context, not score or processing authority. The
browser continues to derive recovery only from the top-level lifecycle
contract and never infers a score, completion tier, or provider state from the
workspace.

`frozenTranscript` is `pending` while the session is `ending`. A version-1
terminal snapshot is `ready` only when its immutable cutoff and frozen time are
finite, ordered (`frozen time >= cutoff`), and its evidence state is `complete`
or `partial`; other version-1 terminal evidence is `unavailable`. A terminal
legacy session retains the existing bounded legacy frozen-read behavior. No
active or ending session may use that legacy fallback. The client retains the last strictly decoded
workspace while later rolling-compatible lifecycle responses omit the optional
field, and clears it when the route changes to another session.

The processing UI shows the saved question and round, one textual durable-stage
progress list, explicit delayed/retryable/paused copy, Interview History, and
frozen transcript availability. Automatic polling keeps its existing bounded
budget. Poll exhaustion removes active-work animation and exposes a read-only
`Check again` action. Only the stage title and description form a polite,
atomic live region; question context, actions, progress history, and transcript
content remain outside it so repeated polls do not announce the full workspace.

Eligible user-ended feedback is dispatched before room cleanup and credit
convergence. Production evaluation requests cap output at 2,000 completion
tokens, cap one request at 75 seconds, and disable SDK-level retries. The typed
workflow policy owns provider attempts inside the one 90-second generation
deadline; durable Inngest replay owns only transient infrastructure and
persistence recovery.

## Compatibility

Retired direct-generation endpoints remain explicit `410 Gone` tombstones.
Legacy direct database writers are removed; read APIs remain compatible with
stored Feedback v1, Feedback v2, and evidence-limited v2 records without
rewriting them.
