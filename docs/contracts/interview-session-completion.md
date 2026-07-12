# Interview Session Completion Contract

## Invariant

For each interview session, the database contains at most one feedback row and at most one feedback-generation event identity. Session terminalization, the feedback row, and the event intent become visible in one database commit.

The session lifecycle remains the source of terminal truth. Feedback and Inngest never mark an interview completed.

## End Command

`POST /api/interview/end` accepts an authenticated `sessionId`. Ownership is
checked before transcript validation and rechecked inside the terminalization
transaction. System `time_limit` authority is available only to the internal
deadline consumer; actor and requested reason are one discriminated command.

The workflow:

1. authorizes the command without reading transcript content;
2. calculates feedback eligibility from durable transcript turns;
3. locks the session row and rechecks authority;
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

A persisted transcript turn is durable evidence that the session became usable. When terminalization sees such evidence before a terminal claim, it may advance a not-yet-active session through the required `active` edge before claiming `ending`.

- Eligible signal plus `user_end` derives `completed` after activation.
- Ineligible signal claims `insufficient_signal` and derives `abandoned`.
- An existing `ending` or terminal claim keeps its stored reason and derives only the matching terminal state.

The final stats are the durable turns available to this slice. Transcript drain, cutoff identity, and late-turn policy remain owned by SAV-194.

## Feedback Result

- A completed and eligible session creates `feedback.status=pending`.
- Any other terminal outcome creates `feedback.status=skipped` with a user-safe reason.
- `feedback.session_id` is unique.
- The feedback worker may change feedback status and result fields. It must not write session lifecycle or legacy session status.

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

The five-minute deadline recovery scan includes every terminal session whose
deadline room-cleanup claim is still `pending`, including refined
`insufficient_signal` outcomes, plus acknowledged deadline-owned sessions with
a retryable eligible feedback outbox. Exhausting one event's retry budget
therefore cannot strand a live room or an acknowledged feedback dispatch.

## Acceptance Evidence

- Ten simultaneous end commands converge on one terminal result, one feedback row, and one event ID.
- At most one non-expired dispatch claim is accepted.
- Send failure and expired-lease recovery create one unique event ID per accepted attempt.
- Terminal-without-feedback repair does not alter terminal lifecycle fields.
- The worker has no session-status write.
- Clean and upgrade migrations pass with the outbox checks and indexes present.
- Delete failure commits terminal truth without dispatch; acknowledged retry
  dispatches once; later replay emits no duplicate.
