# Design

## Durable graph

The Inngest function invokes five stable `step.run` IDs:

1. `runtime-settlement-v1`
2. `terminalize-session-v1`
3. `dispatch-feedback-v1`
4. `schedule-room-cleanup-v1`
5. `settle-credit-v1`

Runtime settlement remains fail open for the user's terminal intent and fail
closed for transcript eligibility. Terminalization must succeed before the
remaining work begins. Dispatch, cleanup, and credit are sibling steps, so a
failure in one does not replay or erase successful siblings.

Inngest documents that each step is individually retried and successful step
results are memoized across function retries. It also treats step IDs as durable
state identifiers across deploys. The implementation therefore uses stable,
versioned IDs and JSON-only checkpoint summaries.

References:

- <https://www.inngest.com/docs/learn/inngest-steps>
- <https://www.inngest.com/docs/features/inngest-functions/error-retries/retries>
- <https://www.inngest.com/docs/learn/versioning>

## Canonical replay

The terminalization step emits only lifecycle, room, feedback-state, and
allowlisted evidence classifications. Feedback dispatch does not deserialize a
rich ORM record from Inngest. It re-enters the existing owner-scoped feedback
recovery workflow, which reads and atomically claims the canonical outbox.
The provider event send is bounded at three seconds. Timeout or failure marks
only the matching fenced claim failed, so a retry can proceed immediately and
a late sender cannot acknowledge a newer claim.

## Recovery

The minute user-end scan selects:

- accepted `ending/user_end` sessions, which resume from runtime settlement;
- terminal sessions with pending/failed feedback generation and pending,
  failed, stale-sending, or failed-generation-after-sent dispatch state, which
  resume from feedback dispatch.

Deadline-owned sessions with unacknowledged room cleanup remain excluded because
their dedicated deadline recovery workflow owns that fence.

## Observability

Stage events use schema version 2 and add one allowlisted `reason`. Reasons
distinguish runtime timeout/unavailability/readiness, missing or degraded
transcript evidence, existing terminal replay, dispatch failure/in-progress,
not-required cleanup, and generic stage exceptions. Raw errors and product data
never enter the event.
