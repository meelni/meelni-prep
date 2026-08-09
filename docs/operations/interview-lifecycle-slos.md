# Interview Lifecycle SLOs and Recovery

This runbook defines the authenticated interview lifecycle from customer Start
Interview intent through canonical runtime readiness, End Interview acceptance,
and readable feedback. The database lifecycle and feedback rows are
authoritative; LiveKit and Inngest delivery acknowledgements are evidence about
work, not completion truth.

## Service levels

| Boundary                               | Target | Upper bound | Customer/recovery behavior                                                                                      |
| -------------------------------------- | -----: | ----------: | --------------------------------------------------------------------------------------------------------------- |
| Start request                          |    3 s |        10 s | Abort that browser request, retain the stable start-attempt UUID, and automatically replay the same intent.     |
| Start automatic recovery               |   10 s |        60 s | Retry one request at a time using server guidance; stop on ready, definitive failure, cancellation, or unmount. |
| LiveKit transport connection           |    5 s |        10 s | Continue showing interviewer-joining truth until agent liveness or canonical readiness is observed.             |
| Transport connected to canonical ready |   10 s |        25 s | Keep the room mounted and End available; show delayed only while verified interviewer liveness is also absent.  |
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

### Implemented deadline ladder

The SLO table describes customer objectives and stale-state transitions. The
current synchronous circuit breakers are intentionally nested below the
browser transport:

| Operation                        | Breaker |
| -------------------------------- | ------: |
| Supabase server auth transport   |     4 s |
| Interactive read statement       |     5 s |
| End row-lock acquisition         |   1.5 s |
| End database statement           |   2.5 s |
| End/read/recovery route response |   5.5 s |
| Browser lifecycle transport      |   6.5 s |
| Feedback provider event send     |     3 s |

The route breaker bounds the customer response; the transaction-local database
breakers also stop timed-out work from retaining a pooled connection after the
response. Do not replace them with session-level Postgres settings because the
runtime uses a transaction pooler.

## State ownership and safe retry

- A timed-out start is ambiguous. Preserve its client-generated attempt UUID;
  clearing it could turn one customer intent into two interview sessions.
- LiveKit transport `connected` and canonical lifecycle `active` are separate
  facts. Browser-observed agent liveness may enable conversation input and
  prompt authenticated repair, but it never persists or authorizes canonical
  `active` state.
- Canonical readiness exhaustion is `delayed`, not proof of transport loss.
  If an active LiveKit agent is already listening, thinking, or speaking, the
  customer state is `syncing` instead of joining/delayed and the liveness latch
  remains set for that session and room generation. Token rotation is reserved
  for a real disconnect or terminal authorization failure.
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
stage and latency class across `launch_request`, `launch_recovery`,
`authorization_gate`, `account_trial`, `question_selection`,
`durable_session_credit_reservation`, `provisioning_claim`,
`deadline_scheduling`, `livekit_room_create`, `livekit_room_verification`,
`livekit_dispatch_verification`, `readiness_persistence`, `token_issuance`,
`transport_connection`, and `canonical_readiness`. The durable-session and
credit stage is intentionally one timing because that mutation is atomic.

`interview_liveness_contradiction` version 1 records only observed/resolved
phase, bounded duration and duration class, and a resolution code. It identifies
the content-free interval where verified conversational agent liveness is ahead
of canonical readiness; it excludes session, room, participant, transcript,
question, token, provider payload, and raw error fields.

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
2. If a start request reaches ten seconds, confirm automatic replay uses the
   same attempt UUID, respects short readiness retry guidance, and inspect
   whether the original workflow committed. A second customer click should not
   be required.
3. If readiness reaches 25 seconds, inspect provider participant presence and
   reconciliation latency. The customer must retain an enabled End action. If
   the agent is already conversationally active, the room must show `syncing`,
   keep the microphone available, and prompt a fresh authenticated repair.
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
- A simulated start whose first request commits after the 10-second browser
  abort remains in the still-starting state, receives a short busy retry, and
  returns ready credentials for the same attempt within the 60-second recovery
  bound. Requests never overlap, and no second customer click or credential
  rotation is required.
- A stalled presence read aborts inside three seconds, becomes delayed after
  the readiness bound, keeps End available, and later converges.
- A speaking/listening agent or first correlated interviewer transcript changes
  delayed UI to `syncing`, keeps microphone and End available, and converges
  after a late canonical repair without rotating credentials.
- Reconnect transport truth takes precedence over the liveness latch; stale
  confirmation responses and unmounted confirmation work cannot overwrite the
  newer state.
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
