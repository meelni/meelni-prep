# Interview Session Completion Contract

## Invariant

For each interview session, the database contains at most one feedback row and at most one feedback-generation event identity. Session terminalization, the feedback row, and the event intent become visible in one database commit.

The session lifecycle remains the source of terminal truth. Feedback and Inngest never mark an interview completed.

## End Command

`POST /api/interview/end` accepts an authenticated `sessionId`. Ownership is
checked before transcript validation and rechecked inside the terminalization
transaction. System `time_limit` authority is available only to the internal
deadline consumer; actor and requested reason are one discriminated command.

For an unclaimed user end, the request path:

1. locks the owner-scoped session row with a 1.5-second lock timeout and a
   2.5-second transaction-local statement timeout;
2. atomically advances it to `ending/user_end`, increments the lifecycle
   version, and records millisecond-precision `ending_at`;
3. attempts bounded delivery of a versioned, idempotent background event;
4. returns HTTP 202 with the feedback loading URL. The durable `ending` row is
   also the recovery signal if event delivery is lost.

The background finalizer asks the current LiveKit writer to settle exactly at
`ending_at` within a 20-second provider budget. It then calculates feedback
eligibility under the session-row lock from each writer's contiguous committed
database watermark. Every registered generation must be healthy and gap-free.
Complete evidence also requires settlement no later than the terminal cutoff;
when settlement is missing, an otherwise eligible database-proven prefix is
explicitly downgraded to partial feedback. Degraded settlement, candidate
markers, canonicalization-failure markers, gaps, and malformed boundaries fail
closed. The exact `interviewer/no_provider_confirmed_prefix` marker contains no
candidate evidence and preserves an independently trustworthy prefix. Runtime
settlement, terminalization,
feedback dispatch, room-cleanup scheduling, and credit convergence use stable,
versioned durable checkpoints. After terminal truth commits, dispatch, cleanup,
and credit run as sibling checkpoints; a failed operation retries without
replaying successful siblings. Cleanup and credit cannot delay feedback
dispatch or reopen terminal truth.

Transcript turns and integrity markers consume one writer-scoped monotonic
sequence namespace. Stable replays preserve their original assignment, so a
turn/marker interleave can arrive out of order without cross-kind sequence
collisions or a manufactured writer gap.

The synchronous End route has a 5.5-second server breaker below the browser's
6.5-second transport deadline. Lock, statement, auth, or route exhaustion is a
private retryable `503`; it is not an authorization failure. The three-second
End acceptance SLO remains the operating upper bound, while the larger route
breaker is a fail-safe that guarantees control returns to the reconciliation
loop.

Settlement and dispatch are separate typed workflow boundaries. Background
user-end and system workflows call both boundaries in sequence. A hard-deadline
command may commit settlement while LiveKit room deletion is retryable, but it
must not enter the dispatch boundary until room deletion is acknowledged as
`deleted` or `already_absent`. The accepted hard-deadline command independently
claims `deadline_room_cleanup_status=pending`; provider acknowledgement stores
the exact terminal disposition and acknowledgement time before dispatch. The
claim commits before the first provider deletion attempt, remains immutable
through concurrent ordinary-end and idempotent settlement calls, and is the
recovery worker's durable ownership record after a deletion failure. Both the
settlement dispatch boundary and the central outbox claim refuse dispatch while
that record is `pending`. The claim remains authoritative when validation refines the lifecycle reason to
`insufficient_signal`, so this gate also applies when feedback is skipped and
dispatch is `not_required`. A concurrent `user_end` winner never gains a
deadline cleanup claim.

Equivalent replays return the stored result. An existing terminal reason is immutable. A historical terminal session without feedback is repaired by creating the missing feedback result; its lifecycle is not reopened.

## Durable Signal And Terminal Outcome

Transcript volume never creates canonical activation. Activation comes only
from the signed LiveKit candidate-and-agent presence workflow.

Version-1 credit usability requires both canonical activation and a persisted,
non-blank version-2 interviewer turn whose delivery state is `delivered`.
Partial, interrupted, user, legacy, textless, and integrity-marker records do
not qualify. The usable marker and credit consumption commit atomically behind
the owning user lock. A terminal session without usable evidence releases its
reservation. A usable session retains the charge for user end, deadline, or
post-usable abandonment, but a machine-classified provider or transcript
integrity failure refunds it under `interview-credit-recovery.v1`. Feedback
dispatch or generation outcome never changes billing.

- Valid completion signal plus `user_end` derives `completed` only when the
  lifecycle was canonically activated.
- Ineligible completion signal claims `insufficient_signal` and derives
  `abandoned`.
- An existing `ending` or terminal claim keeps its stored reason and derives
  only the matching terminal state.

The final stats are calculated inside the terminal transaction after it locks
the same session row used by canonical transcript ingest. The browser owns no
transcript write queue and cannot publish LiveKit data. Explicit browser end
commits `ending_at` and leaves; the background worker targets the current agent
and writer generation with a reliable metadata-only request, then waits for
durable settlement before terminalization. While `ending/user_end`, events at
or before `ending_at` and settlement exactly at `ending_at` remain admissible;
later evidence is rejected. Ingests that
acquired the row first become visible to terminal validation; once terminal
truth commits, new distinct events are closed while equivalent event-ID replays
stay idempotent. Hard deadlines use semantic cutoff `D`: audio stops at `D`,
only evidence measured at or before `D` is eligible, and settlement records `D`
even if its database acknowledgement arrives during cleanup grace. The
finalizer then freezes `transcript_evidence_version=1`, the semantic cutoff,
the evidence classification, and one immutable committed boundary per writer
in the same transaction as terminal truth and the feedback outbox. Statistics,
feedback eligibility, and outcome use only turns inside those boundaries. The
feedback worker later reads that frozen prefix, never the mutable session tail.
An invalid snapshot may versionedly refine
the matching provisional user-end, deadline, or reconnect reason to
`insufficient_signal`; provider and terminal reasons are not rewritten.

System deadlines settle the durable evidence available when they acquire the
row. For explicit user end, eligible feedback dispatch occurs immediately
after terminal truth commits and before version-1 credit convergence or room
cleanup. Credit and cleanup failures remain recoverable and do not change
feedback eligibility.
The terminal policy action and support evidence commit with the ledger action
under the owner/session/reservation/grant lock order. See
[Interview Credit Recovery](./interview-credit-recovery.md).

## Feedback Result

- A completed session with at least one trustworthy reviewable candidate
  answer creates `feedback.status=pending`; duration and total-turn count are
  not eligibility gates.
- Long-form recognized evidence may be reviewable for qualitative coaching
  without satisfying the strict scoreable language surface. It requires the
  existing quantitative gates, at least 40 lexical tokens, two distinct
  recognized PM/reasoning signals, and signals in two bounded segments.
- Five strict scoreable answers permit full-depth evaluation. A smaller healthy
  prefix remains partial, and fewer than four scoreable answers receive
  scoreless evidence-limited structured feedback rather than inferred scores.
  The provider selects only closed PM-rubric codes and trusted candidate-turn
  aliases. The server owns all qualitative copy and restores exact quantities
  only through frozen-transcript evidence citations.
- No trustworthy candidate answer creates terminal `feedback.status=skipped`
  with `outcome_reason=no_reviewable_answer`.
- A corrupt or degraded frozen transcript creates terminal
  `feedback.status=skipped` with
  `outcome_reason=transcript_integrity_degraded`.
- `feedback.session_id` is unique.
- The feedback worker may change feedback status and result fields. It must not write session lifecycle or legacy session status.
- New completed feedback uses the strict, evidence-grounded
  [Feedback v2 or evidence-limited companion contract](./feedback-v2.md).
  Legacy v1 feedback remains readable.
- Worker claims, terminal writes, retries, and stale-event behavior follow the
  [feedback generation contract](./feedback-generation.md).

## Dispatch Outbox

The feedback row carries a provider-neutral outbox:

| Field                 | Meaning                                                   |
| --------------------- | --------------------------------------------------------- |
| `dispatch_status`     | `not_required`, `pending`, `sending`, `sent`, or `failed` |
| `dispatch_event_id`   | Stable identity for the currently claimed attempt         |
| `dispatch_attempts`   | Number of accepted dispatch claims                        |
| `dispatch_claimed_at` | Lease start for the current sender                        |
| `dispatched_at`       | Provider acknowledgement time                             |
| `dispatch_last_error` | Redacted failure summary for recovery and operations      |

Only `pending`, `failed`, or an expired `sending` lease can be claimed, and no
claim is accepted while the session has pending deadline room cleanup. A
successful claim atomically changes the row to `sending`, increments the
attempt, and assigns an attempt-scoped provider event ID. Concurrent claimers
therefore converge on one stored identity, while a later accepted retry gets a
new identity that provider deduplication cannot suppress. The provider event
always carries the stored event ID. Acknowledgement changes it to `sent`;
failure changes it to `failed` without changing `feedback.status=pending`.

For a persisted deadline cleanup claim, `pending`, `sending`, or `failed` is not
sufficient evidence that feedback is safe to expose. The deadline consumer
retries acknowledged room deletion first and considers feedback ready only
after dispatch is `sent` or feedback is `not_required`, and only when the
independent room-cleanup claim is acknowledged. A replay reuses terminal truth and the outbox
fence, so it cannot emit a second accepted feedback event.

A feedback event send has a three-second provider deadline. A send timeout
marks only the matching fenced claim `failed`, allowing an immediate safe retry
without waiting for the two-minute stale-sender lease. A crash between provider
acknowledgement and the `sent` write can cause a later attempt. Attempt fencing
and the idempotent feedback worker make concurrent or delayed events converge
on the same feedback row.

## API And Client Behavior

The first accepted end response is HTTP 202 with `status=settling`, durable
session truth, delivery status, and a safe feedback URL. An already-terminal
replay returns HTTP 200. A deferred immediate event send still returns 202
because the `ending` row is recovered every minute. Storage and authorization
failures return non-2xx.

The browser bounds acceptance transport to 6.5 seconds, while the operating
acceptance upper bound remains three seconds. On any 2xx response it closes
the interview surface and navigates immediately. On an ambiguous transport
failure it polls lifecycle truth through bounded, abortable reads; `ending` is
sufficient for navigation and never requires the candidate to keep the room
page open. The same client deadline applies to an idempotent End retry, so a
stalled transport cannot permanently own the reconciliation loop.

`POST /api/interview/runtime-settlement` accepts only an authenticated,
owner-scoped `sessionId`. It derives the cutoff from database time bounded by
the hard deadline, resolves the active agent through server-side LiveKit
presence, sends the same trusted settlement packet used by reconnect recovery,
and waits up to 20 seconds for the exact writer generation's durable
acknowledgement. Missing writer/agent presence and missing acknowledgement
remain retryable. A durable degraded settlement permits terminalization but
fails feedback eligibility closed. The browser never calls LiveKit
`performRpc()` because participant tokens retain `canPublishData=false`.

`GET /api/feedback/:sessionId` reports non-retryable `settling` for every
`ending` session and for a hard-deadline session
whose room cleanup is not acknowledged. After acknowledgement it exposes the
durable feedback/dispatch state. Authenticated `POST` cannot bypass pending
cleanup; once acknowledged, it uses the same idempotent outbox retry path as
deadline recovery. Other terminal reasons preserve the existing retry behavior
and claim a new attempt identity only when the stored state is retryable. No
path creates a second feedback row.

Terminal feedback presentation preserves the typed outcome. No-answer copy is
concise and non-scored. Transcript degradation is presented as a system
unavailable state and never translated into duration, microphone, answer
length, or answer-quality advice. A retry action appears only for retryable
dispatch or generation work; immutable no-answer and frozen-degradation states
do not offer a false recovery action.

`GET /api/session/:sessionId` exposes `feedbackReady` for compatibility and
diagnostics. The focused room hands presentation to the feedback lifecycle as
soon as owned truth is `ending` or terminal; it does not wait for
`feedbackReady=true`. The feedback API continues to report `settling` and to
withhold dispatch/content while deadline room cleanup is unacknowledged.

A reconnect-timeout owner must keep the room and agent alive long enough to
send a reliable trusted metadata-only settlement request targeted to the
current writer generation and cutoff. It waits for durable database
acknowledgement or a bounded degraded/missing result before deleting the room
and finalizing. Passive drain time is not settlement proof, and a replacement
writer cannot satisfy an earlier registered generation's obligation.

The five-minute deadline recovery scan includes every terminal session whose
deadline room-cleanup claim is still `pending`, including refined
`insufficient_signal` outcomes, plus acknowledged deadline-owned sessions with
a retryable eligible feedback outbox. Exhausting one event's retry budget
therefore cannot strand a live room or an acknowledged feedback dispatch.

The minute user-end recovery scan includes both accepted `ending/user_end`
sessions and terminal sessions whose eligible feedback generation/outbox state
is retryable. Terminal outbox recovery resumes at feedback dispatch and does
not repeat the LiveKit settlement request. Deadline-owned sessions with pending
room-cleanup acknowledgement remain owned by the deadline recovery scan.

## Acceptance Evidence

- The named `test:interview-resilience` contract proves the workflow, end API,
  transcript single-flight boundary, ambiguous client reconciliation, and
  pending feedback UI handoff together in required CI.
- Ten simultaneous end commands converge on one terminal result, one feedback row, and one event ID.
- At most one non-expired dispatch claim is accepted.
- Send failure and expired-lease recovery create one unique event ID per accepted attempt.
- Terminal-without-feedback repair does not alter terminal lifecycle fields.
- The worker has no session-status write.
- Clean and upgrade migrations pass with the outbox checks and indexes present.
- Delete failure commits terminal truth without dispatch; acknowledged retry
  dispatches once; later replay emits no duplicate.
- Replacement writer B settled while registered writer A is missing or degraded
  remains feedback-ineligible.
- Browser End works while participant data publishing remains disabled; the
  accepted background command receives durable writer settlement before
  terminalization.
- A credit-settlement exception after terminal commit leaves already-dispatched
  feedback unchanged and remains idempotently recoverable.
- A failure at finalization, feedback dispatch, cleanup scheduling, or credit
  convergence retries only that durable checkpoint; successful sibling steps
  remain memoized.
- Reconnect settlement request and durable acknowledgement occur before room
  deletion; missing acknowledgement fails closed.
