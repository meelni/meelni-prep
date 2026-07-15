# Interview Session Reconnect Operations

The product contract is [Interview Session Lifecycle](../contracts/interview-session-lifecycle.md).

## Required Configuration

- A LiveKit Cloud project, server URL, API key, and API secret. This teardown
  contract relies on Cloud token revocation; a self-hosted deployment requires
  a separately reviewed equivalent before use.
- A LiveKit webhook targeting `POST /api/webhooks/livekit`, with
  `participant_joined`, `participant_left`, and
  `participant_connection_aborted` delivery enabled.
- `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` for reconnect scheduling and
  worker verification.
- An isolated Preview database and LiveKit project. Do not rehearse Preview
  reconnects against Production data.

The app verifies the raw webhook body with LiveKit's authorization header.
Never place an intermediary in front of the route that rewrites the body.

## Runtime Policy

- Reconnect grace: 30 seconds from the accepted server loss transition.
- LiveKit room departure timeout: 60 seconds.
- Agent behavior: keep the existing agent session open when the linked
  candidate disconnects.
- Resume behavior: use the same session ID and room, mint a fresh participant
  token with a maximum five-minute lifetime, and never reserve another credit
  or dispatch another agent. Decode the signed JWT and withhold it unless its
  actual `exp` is strictly later than a second PostgreSQL-time authorization
  snapshot and no later than the whole-second floor of the earlier reconnect
  or hard deadline.
- Startup signs the participant token before room creation or agent dispatch.
  The `created → connecting` CAS establishes a five-minute durable provisioning
  lease from PostgreSQL's clock before the first provider side effect.
- Hard deadline: continues during reconnect and wins when earlier than or equal
  to reconnect expiry. Every accepted loss persists the earlier effective
  cutoff and whether reconnect grace or the hard deadline owns termination.
- Every terminal path persists `room_cleanup_pending`; user end attempts
  candidate-token revocation and deletion immediately, and a five-minute
  recovery scan retries each row independently until LiveKit acknowledges
  deletion or absence. Never-attempted and least-recently-attempted rooms run
  first; the same cursor advances before cleanup, provisioning, and credit-only
  recovery attempts. Revocation omits a client-provided cutoff so LiveKit Cloud
  records provider current time; a slow or rolled-back app clock cannot leave
  an older token valid, and a missing participant response still revokes it.
- Because LiveKit webhooks are best-effort, a one-minute reconciliation scan
  checks authoritative participant presence for connecting, active, and
  reconnecting rooms. Connecting activation requires the exact standard
  candidate plus a distinct LiveKit agent-kind participant, both in
  joined/active provider state. Provider read
  failure retries without creating a synthetic loss or readiness receipt.
- A post-provision start failure atomically terminalizes with cleanup intent
  before immediate teardown. Partial agent dispatch, deadline scheduling, and
  credit consumption failures remain recoverable when LiveKit teardown fails.
  A stale connecting lease is independently scanned and claimed with exact
  state, lifecycle-version, lease-timestamp, and age fencing. Recovery releases
  an active credit reservation or refunds a consumed reservation idempotently.
- Reconnect expiry rechecks authoritative presence before claiming timeout,
  accepts only `JOINED`/`ACTIVE` candidate evidence with a finite `joinedAt`
  strictly before the stored reconnect deadline,
  revokes candidate tokens before room deletion, waits a bounded two seconds
  for durable transcript delivery, and finalizes from one validation snapshot.
  Token authorization, signed rejoin, ordinary presence repair,
  stale-provisioning claims, and timeout claims use PostgreSQL time. At or after
  a grace-owned cutoff, only the due-presence CAS may recover the session, and
  only from exact-generation provider evidence whose `joinedAt` is strictly
  before the stored cutoff. Equality or later evidence is denied.

## Preview Rehearsal

Keep the relaunch flag default-off. After Preview isolation and Inngest keys are
ready:

1. Start one voice interview and record only redacted correlation suffixes.
2. Simulate a short network loss. Confirm `active → reconnecting → active`, the
   30-second deadline does not move, the timer continues, and the UI announces
   reconnecting then recovered.
3. Reload the page from a `?sessionId=...` URL. Confirm a fresh token joins the
   same room and agent; no second session, room, credit transaction, dispatch,
   or feedback row appears.
4. Repeat two drops. Replay the first restore and timeout deliveries; confirm
   the second lifecycle version remains authoritative.
5. Kill the tab and verify the signed webhook starts grace without a browser
   signal.
6. Stay disconnected through the exact deadline. Confirm one
   `disconnect_timeout` claim, candidate revocation before room deletion, a
   two-second transcript drain, one validation snapshot, terminal session, and
   feedback intent. Replay the event and confirm no duplicate result.
7. Overlap a drop with the hard deadline. Confirm `time_limit` wins when its
   absolute deadline is earlier or equal.
8. Exercise a room-delete failure. Confirm the accepted timeout claim remains
   immutable and a retry completes deletion and settlement.
9. Race two retries with divergent durable-signal validation. Confirm the first
   completed or abandoned settlement remains immutable and the loser cannot
   rewrite `disconnect_timeout` or `insufficient_signal`.
10. Delay real LiveKit token signing across the computed TTL window. Confirm
    the adapter withholds a JWT whose actual `exp` exceeds the server-owned
    authorization deadline.
11. Disable or drop one candidate-loss webhook. Confirm the next presence scan
    synthesizes one loss and schedules grace. Drop a candidate-join webhook and
    confirm authoritative presence repairs reconnecting exactly once.
12. Make participant-list inspection fail. Confirm no synthetic loss or
    timeout claim is written, then restore the provider and verify retry.
13. Leave one terminal room cleanup permanently failing while another is
    pending. Confirm per-session retries and the persisted fairness cursor let
    the healthy room complete without waiting for the poison room.
14. Drop the initial candidate-join webhook, the agent-ready webhook, then both
    in separate runs. Confirm the presence scan activates exactly once only
    while the exact standard candidate and a distinct agent-kind participant
    are both listed. Verify arbitrary participants and stale join evidence are
    inert.
15. Force room creation to succeed and agent dispatch to fail, then fail the
    immediate teardown. Confirm `failed + provider_failure + cleanup_pending`
    commits before credit release and terminal-room recovery later clears the
    marker after provider-confirmed teardown. Repeat for deadline-schedule and
    credit-consume failures.
16. Make token signing fail and confirm no room-create or dispatch call occurs.
    Then throw after room creation while lifecycle terminalization and immediate
    teardown both fail. After five minutes, confirm the stale provisioning
    lease is claimed, teardown retries, active credit releases or consumed
    credit refunds exactly once, and both durable markers eventually clear.
17. During reconnect, return candidate states `JOINING`, missing/invalid
    `joinedAt`, and `joinedAt` equal to or later than the deadline. Confirm each
    is denied. Confirm `JOINED` or `ACTIVE` at deadline minus one millisecond is
    accepted only for the matching lifecycle version and stored deadline.
18. Simulate application clocks that are slow, fast, and roll backward. Confirm
    token issuance, presence repair, stale provisioning, and timeout claims
    still follow PostgreSQL time and never extend the stored cutoff. Confirm
    teardown sends no client revocation timestamp and therefore uses LiveKit
    Cloud provider time before room deletion.
19. Create more than 250 retryable poison rows ahead of one healthy cleanup,
    including credit-only rows. Confirm every attempted row advances the shared
    cursor, the healthy row reaches the next scan, and a failed credit settlement
    remains retryable until its marker is acknowledged.
20. Lose transport inside the final 30 seconds. Confirm the hard deadline is
    stored as the effective cutoff, no grace-timeout job is scheduled, recovery
    succeeds only before that cutoff, and the hard-deadline worker wins at
    equality.
21. Deliver the hard-deadline event one millisecond early. Confirm PostgreSQL
    returns `not_due`, a distinct durable retry remains scheduled at the exact
    canonical deadline, and equality/+1 millisecond atomically claim
    `ending (time_limit)` by state, version, and derived deadline even when the
    application clock is slow or fast.
22. Advance PostgreSQL time through a JWT's decoded `exp` while token signing
    is in flight. Confirm the second authorization read withholds the token and
    returns a retryable provider-unavailable response; repeat with slow and fast
    signer clocks and confirm no token exceeds the canonical cutoff.

SAV-194 transcript event identity must be deployed before this ticket can be
declared launch-ready; repeated packets across reload must not create duplicate
durable turns.

## Monitoring And Rollback

Monitor redacted counts and latency for `active → reconnecting`, recovery,
timeout, presence reconciliation, stale provider events, lifecycle conflicts,
webhook signature failure, participant revocation failure, room deletion
failure, and reconnect schedules recovered by cron. Alert on a
reconnecting row past its deadline, a claimed timeout stuck in `ending`, or a
terminal row whose reconnect cleanup marker remains set after the provider
recovery window. Also alert on a connecting provisioning lease older than five
minutes or a terminal provisioning marker that remains after credit settlement.

Never log participant tokens, webhook bodies, room metadata, transcript text,
email, or provider credentials.

Rollback with the relaunch flag still off. Keep the additive schema and stored
lifecycle facts. Disable webhook delivery and reconnect reads only after open
sessions have terminalized; never decrement versions, extend existing grace,
or rewrite terminal reasons.
