# Interview Session Completion Contract

## Invariant

For each interview session, the database contains at most one feedback row and at most one feedback-generation event identity. Session terminalization, the feedback row, and the event intent become visible in one database commit.

The session lifecycle remains the source of terminal truth. Feedback and Inngest never mark an interview completed.

## End Command

`POST /api/interview/end` accepts an authenticated `sessionId`. Ownership is
checked before transcript validation and rechecked inside the terminalization
transaction. System `time_limit` authority is available only to the internal
deadline consumer; actor and requested reason are one discriminated command.

For an unclaimed user end, the workflow:

1. authorizes the command without reading transcript content;
2. locks the session row and rechecks authority;
3. calculates feedback eligibility from durable transcript turns, integrity
   markers, registered `writer_generation` records, and writer-scoped settlements while
   holding the same row lock used by canonical ingest; every registered
   generation must be settled and none may be missing or degraded;
4. preserves an existing terminal result or advances a nonterminal session through valid lifecycle edges;
5. records final statistics;
6. creates the unique feedback row if it is missing;
7. stores a deterministic feedback event ID when feedback is eligible;
8. commits all database state before attempting provider dispatch.

Settlement and dispatch are separate typed workflow boundaries. Ordinary
authenticated end commands call both boundaries in sequence. A hard-deadline
command may commit settlement while LiveKit room deletion is retryable, but it
must not enter the dispatch boundary until room deletion is acknowledged as
`deleted` or `already_absent`. The accepted hard-deadline command independently
claims `deadline_room_cleanup_status=pending`; provider acknowledgement stores
the exact terminal disposition and acknowledgement time before dispatch. The
claim commits before the first provider deletion attempt, remains immutable
through concurrent ordinary-end and idempotent settlement calls, and is the
recovery worker's durable ownership record after a deletion failure. Both the
settlement dispatch boundary and the central outbox claim refuse dispatch while
that record is `pending`.
claim remains authoritative when validation refines the lifecycle reason to
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
first calls the authenticated runtime-settlement endpoint; the server targets
the current agent and writer generation with a reliable metadata-only request,
then waits for durable settlement before terminalization. Ingests that
acquired the row first become visible to terminal validation; once terminal
truth commits, new distinct events are closed while equivalent event-ID replays
stay idempotent. Hard deadlines use semantic cutoff `D`: audio stops at `D`,
only evidence measured at or before `D` is eligible, and settlement records `D`
even if its database acknowledgement arrives during cleanup grace. The
finalizer then calculates one locked transcript snapshot for statistics,
feedback eligibility, and outcome. An
invalid snapshot may versionedly refine only that provisional ending reason to
`insufficient_signal`; user, provider, reconnect, and terminal reasons are not
rewritten.

System deadlines settle the durable evidence available when they acquire the
row. After terminal truth commits, the end workflow converges the version-1
credit reservation before dispatching feedback; settlement failure stays
retryable and does not change feedback eligibility. Because terminal truth is
already committed, a credit-settlement exception returns that committed result
with dispatch still pending instead of turning the end request into a non-2xx
response. An idempotent replay or recovery worker converges credit before
claiming the feedback outbox.
The terminal policy action and support evidence commit with the ledger action
under the owner/session/reservation/grant lock order. See
[Interview Credit Recovery](./interview-credit-recovery.md).

## Feedback Result

- A completed and eligible session creates `feedback.status=pending`.
- Any other terminal outcome creates `feedback.status=skipped` with a user-safe reason.
- `feedback.session_id` is unique.
- The feedback worker may change feedback status and result fields. It must not write session lifecycle or legacy session status.
- New completed feedback uses the strict, evidence-grounded
  [feedback v2 contract](./feedback-v2.md). Legacy v1 feedback remains readable.
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

A crash between provider acknowledgement and the `sent` write can cause a
later attempt. Attempt fencing and the idempotent feedback worker make
concurrent or delayed events converge on the same feedback row.

## API And Client Behavior

The end response remains HTTP 200 when the session committed but provider dispatch is delayed. It returns a retryable dispatch state and the stable feedback ID. Database, authorization, or validation failures return non-2xx.

The browser must inspect `response.ok`. On a non-2xx response it keeps the interview room open, keeps the end modal available, shows the user-safe error, and offers retry. It navigates to feedback only after the end command confirms a committed result.

`POST /api/interview/runtime-settlement` accepts only an authenticated,
owner-scoped `sessionId`. It derives the cutoff from database time bounded by
the hard deadline, resolves the active agent through server-side LiveKit
presence, sends the same trusted settlement packet used by reconnect recovery,
and waits up to 20 seconds for the exact writer generation's durable
acknowledgement. Missing writer/agent presence and missing acknowledgement
remain retryable. A durable degraded settlement permits terminalization but
fails feedback eligibility closed. The browser never calls LiveKit
`performRpc()` because participant tokens retain `canPublishData=false`.

`GET /api/feedback/:sessionId` reports `settling` for a hard-deadline session
whose room cleanup is not acknowledged. After acknowledgement it exposes the
durable feedback/dispatch state. Authenticated `POST` cannot bypass pending
cleanup; once acknowledged, it uses the same idempotent outbox retry path as
deadline recovery. Other terminal reasons preserve the existing retry behavior
and claim a new attempt identity only when the stored state is retryable. No
path creates a second feedback row.

`GET /api/session/:sessionId` exposes `feedbackReady`. The deadline UI waits
for both terminal lifecycle truth and `feedbackReady=true` before navigating
away from the interview saving state.

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
  authenticated server request receives durable writer settlement before the
  terminal command.
- A credit-settlement exception after terminal commit returns HTTP 200, leaves
  feedback dispatch pending, and remains idempotently recoverable.
- Reconnect settlement request and durable acknowledgement occur before room
  deletion; missing acknowledgement fails closed.
