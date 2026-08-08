# Interview Lifecycle SLOs and Recovery

This runbook defines the authenticated interview lifecycle from customer End
Interview acceptance through readable feedback. The database lifecycle and
feedback rows are authoritative; LiveKit and Inngest delivery acknowledgements
are evidence about work, not completion truth.

## Service levels

| Boundary | Target | Upper bound | Customer/recovery behavior |
| --- | ---: | ---: | --- |
| End request acceptance | 1 s | 3 s | The request commits `ending` before provider settlement. |
| `ending` to terminal session | 10 s | 30 s | At 30 s, a `user_end` handoff is delayed and owner-retryable. |
| Terminal session to feedback dispatch | 5 s | 30 s | Durable recovery scans repair missing or failed dispatch. |
| End request to completed feedback | 45 s | 90 s | At 45 s, show delayed copy. At 90 s, a sent-but-unclaimed queue delivery expires and may be redispatched. |
| Feedback lifecycle read | 5 s | 8 s | The server aborts dependency work at 8 s and returns a private, retryable `503`. |

The generation execution lease remains five minutes. A model call that is
known to be processing is not duplicated at the 90-second customer upper
bound. The UI becomes explicitly delayed at 45 seconds, while automatic or
manual generation retry becomes available only after the execution lease
expires.

## State ownership and safe retry

- `sessions.lifecycle_state = ending` with `terminal_reason = user_end` may be
  redelivered after 30 seconds. Each minute has a fresh delivery identity;
  database terminalization remains idempotent.
- `feedback.status = pending` and `dispatch_status = sent` is a queue claim
  lease. If `dispatched_at` is at least 90 seconds old, recovery atomically
  rotates the stored event identity before redispatch. An old delivery cannot
  claim or write after that fence moves.
- `feedback.status = processing` is protected by its separate five-minute
  execution lease. Only an expired lease or an explicit failed state is
  generation-retryable.
- Terminal `completed` and `skipped` feedback never reopen.
- A deadline-ended room with an unacknowledged cleanup claim remains settling
  and non-retryable from the customer surface.

## Telemetry

`meelni_interview_end_stage` version 3 records only bounded operational fields:
stage, outcome, duration, reason code, correlation ID, SLO thresholds, and
latency class. It must never contain transcript text, questions, user IDs,
provider payloads, model output, or stored failure messages.

Aggregate these stages by `slo` and `latencyClass`:

- `accept` / `end_acceptance`
- `finalize` / `terminalization`
- `feedback_dispatch` / `feedback_dispatch`
- `feedback_generation` / `feedback_completion`
- `lifecycle_read` / `lifecycle_read`

Alert activation is a human-owned Production action. Before enabling alerts,
rehearse the normal, lost-finalizer, sent-unclaimed, slow-generation,
insufficient-evidence, and terminal-failure paths in Preview and verify that
sanitized event counts match database truth.

## Incident triage

1. Identify the owner-scoped session and inspect lifecycle timestamps without
   reading transcript content.
2. If `ending/user_end` is older than 30 seconds, use the normal feedback
   recovery POST or allow the recovery scan to redeliver finalization.
3. If feedback is `pending/sent` beyond 90 seconds, confirm recovery rotated
   the event ID and incremented dispatch attempts before redispatch.
4. If feedback is `processing`, do not force a second generation call before
   the five-minute lease expires. Confirm the customer sees the delayed state.
5. If a lifecycle read reaches its eight-second deadline, investigate auth or
   database contention; the response must remain private and retryable.
6. Record a sanitized fixture for every confirmed failure mode before closing
   the incident.

## Preview evidence required for rollout

- End acceptance and terminalization timestamps meet their target on a normal
  interview.
- A deliberately dropped finalizer delivery becomes retryable at 30 seconds
  and converges after redelivery.
- A deliberately unclaimed feedback event becomes retryable at 90 seconds,
  rotates identity, and is claimed once.
- A slow generation renders delayed copy at 45 seconds and does not duplicate
  model evaluation before the execution lease expires.
- Completed, partial, insufficient, failed, and unavailable states remain
  explicit and navigable.
- Stage telemetry contains no customer content and classifies both thresholds
  exactly as this document specifies.
