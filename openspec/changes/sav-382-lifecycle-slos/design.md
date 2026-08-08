# Design

## Canonical thresholds

- End acceptance: p95 1 second, upper bound 3 seconds.
- Terminalization: p95 10 seconds, upper bound 30 seconds.
- Feedback dispatch: p95 5 seconds.
- Feedback completion: p95 45 seconds, upper bound 90 seconds.
- Customer lifecycle read: p99 5 seconds, hard deadline 8 seconds.

The product uses the upper bounds to change user-visible state, not to claim an
SLO has been achieved before measured rollout evidence exists.

## Stale user-end recovery

`ending_at` is the durable acceptance boundary. Before 30 seconds, the feedback
read reports normal non-retryable saving. At or after 30 seconds it reports a
delayed, retryable saving state. Authenticated recovery verifies ownership and
the stored `ending/user_end` state, then redelivers the durable end command with
a minute-bucketed attempt identity. Repeated clients converge on one attempt per
minute; terminal rows continue into ordinary feedback recovery.

## Stale feedback queue recovery

`dispatched_at` begins the worker-claim wait. `pending + sent` is normal through
90 seconds. After 90 seconds it becomes retryable. Preparing retry atomically
returns the row to `pending + failed`, clears the old dispatch lease fields,
and lets the existing outbox claim allocate a new event ID. A late old event is
fenced by `dispatch_event_id`; concurrent new events are fenced by the feedback
generation claim.

An actively `processing` generation retains its existing five-minute lease to
avoid duplicating a potentially expensive model call. After 45 seconds the UI
calls it delayed and tells the user the interview is saved. It becomes directly
recoverable only when that existing processing lease expires.

## Lifecycle UI

The feedback review workspace remains the sole status shell. Response metadata
is reduced to phase, `delayed`, `retryable`, and bounded estimates; no provider
state is exposed. The primary action appears only when recovery can perform a
real durable mutation. Interview history remains the safe secondary exit.

## Telemetry

Stage events carry a versioned SLO name, target, upper bound, and latency class
for a measured duration. Correlation uses only the owned session UUID already
permitted by the redacted observability contract. Event payloads reject
arbitrary reason strings and all customer/provider content.
