# Interview Lifecycle SLOs and Recovery

This runbook defines the authenticated interview lifecycle from customer Start
Interview intent through canonical runtime readiness, End Interview acceptance,
and readable feedback. The database lifecycle and feedback rows are
authoritative; LiveKit and Inngest delivery acknowledgements are evidence about
work, not completion truth.

## Service levels

| Boundary                               | Target | Upper bound | Customer/recovery behavior                                                                                      |
| -------------------------------------- | -----: | ----------: | --------------------------------------------------------------------------------------------------------------- |
| Start request                          |    3 s |        10 s | Abort the browser wait, retain the stable start-attempt UUID, and offer a safe replay of the same intent.       |
| LiveKit transport connection           |    5 s |        10 s | Continue showing interviewer-joining truth; transport connection alone does not enable the microphone.          |
| Transport connected to canonical ready |   10 s |        25 s | Mark readiness delayed, keep the room mounted and End available, then retry one bounded confirmation at a time. |
| One presence reconciliation            |    1 s |         3 s | Abort the probe and treat dependency exhaustion as retryable; do not rotate credentials.                        |
| Session or credential customer read    |    5 s |         8 s | Abort dependency work and return a private, retryable `503`.                                                    |
| End request acceptance                 |    1 s |         3 s | The request commits `ending` before provider settlement.                                                        |
| `ending` to terminal session           |   10 s |        30 s | At 30 s, a `user_end` handoff is delayed and owner-retryable.                                                   |
| Terminal session to feedback dispatch  |    5 s |        30 s | Durable recovery scans repair missing or failed dispatch.                                                       |
| End request to completed feedback      |   45 s |        90 s | At 45 s, show delayed copy. At 90 s, a sent-but-unclaimed queue delivery expires and may be redispatched.       |
| Feedback lifecycle read                |    5 s |         8 s | The server aborts dependency work at 8 s and returns a private, retryable `503`.                                |

The generation execution lease remains five minutes. A model call that is
known to be processing is not duplicated at the 90-second customer upper
bound. The UI becomes explicitly delayed at 45 seconds, while automatic or
manual generation retry becomes available only after the execution lease
expires.

## State ownership and safe retry

- A timed-out start is ambiguous. Preserve its client-generated attempt UUID;
  clearing it could turn one customer intent into two interview sessions.
- LiveKit transport `connected` and canonical lifecycle `active` are separate
  facts. Only provider-verified candidate and agent presence enables interview
  input.
- Canonical readiness exhaustion is `delayed`, not proof of transport loss.
  Token rotation is reserved for a real disconnect or terminal authorization
  failure.
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

`interview_start_stage` version 1 records stage, outcome, duration, SLO
thresholds, and latency class. It excludes session, room, user, token,
transcript, question, provider payload, and raw error fields. Aggregate it by
stage and latency class across `launch_request`, `transport_connection`, and
`canonical_readiness`.

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

1. If start appears stuck, separate launch latency, transport latency, and
   canonical readiness. Do not treat a connected transport as an active
   interview or rotate credentials only because canonical readiness is delayed.
2. If a start request reaches ten seconds, confirm replay uses the same attempt
   UUID and inspect whether the original workflow committed.
3. If readiness reaches 25 seconds, inspect provider participant presence and
   reconciliation latency. The customer must retain an enabled End action.
4. Identify the owner-scoped session and inspect lifecycle timestamps without
   reading transcript content.
5. If `ending/user_end` is older than 30 seconds, use the normal feedback
   recovery POST or allow the recovery scan to redeliver finalization.
6. If feedback is `pending/sent` beyond 90 seconds, confirm recovery rotated
   the event ID and incremented dispatch attempts before redispatch.
7. If feedback is `processing`, do not force a second generation call before
   the five-minute lease expires. Confirm the customer sees the delayed state.
8. If a lifecycle read reaches its eight-second deadline, investigate auth or
   database contention; the response must remain private and retryable.
9. Once durable session truth is `ending` or terminal, confirm the focused
   interview room has handed control to the feedback lifecycle. Do not wait for
   `feedbackReady` in the room; the feedback route owns settling, delayed,
   recovery, and terminal presentation.
10. Record a sanitized fixture for every confirmed failure mode before closing
    the incident.

## Preview evidence required for rollout

- A warm start records launch, transport, and canonical readiness inside their
  targets and enables microphone input only after canonical readiness.
- A simulated 20-second cold start remains mounted and becomes ready without
  credential rotation.
- A stalled presence read aborts inside three seconds, becomes delayed after
  the readiness bound, keeps End available, and later converges.
- A start response lost after commit replays the same attempt UUID and returns
  the original session.
- End acceptance and terminalization timestamps meet their target on a normal
  interview.
- Automatic deadline completion hands `ending` or terminal session truth to the
  feedback lifecycle even while feedback dispatch is still settling, and a
  stalled terminal-truth request aborts before the next bounded poll.
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
