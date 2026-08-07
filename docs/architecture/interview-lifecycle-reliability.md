# Interview lifecycle reliability direction

Status: proposed direction with the first containment slice in progress under
SAV-380. The open program parent is SAV-365.

## Outcome and ownership

One server-owned lifecycle must carry an authenticated PM interview from start
through feedback:

1. Session start reserves capacity and creates canonical session truth.
2. The voice runtime registers one transcript writer generation and persists
   measured evidence write-through.
3. LiveKit data packets notify the browser only after persistence; the browser
   never owns transcript durability.
4. End Interview records one durable cutoff and returns immediately.
5. A durable worker settles evidence, commits terminal truth, dispatches
   eligible feedback, and converges cleanup and credit state.
6. The browser observes typed lifecycle state and never repairs terminal truth
   implicitly.

The workflow owner is the server lifecycle plus its durable outboxes. LiveKit,
Supabase Auth, Postgres, Inngest, and the feedback model are adapters around
that owner, not alternate sources of truth.

## Production evidence and current failure model

A sanitized 2026-08-07 trace showed:

- End acceptance returned quickly and the background finalizer committed
  terminal truth.
- Runtime settlement was deferred and feedback dispatch was skipped.
- Full transcript GETs were initiated repeatedly as the agent moved among
  listening, thinking, speaking, and idle.
- Multiple transcript and feedback reads remained open until the platform's
  300-second function limit.
- The user-facing result was a persistent “Saving your interview” state even
  though this was an infrastructure incident, not ordinary evaluation latency.

The immediate causes are structural rather than one provider outage:

- Agent-state changes amplify one stalled read into overlapping full snapshots.
- Client poll budgets do not help if one fetch has no deadline.
- Supabase auth, Postgres reads, and the route lack nested time budgets.
- The end worker groups settlement, finalization, dispatch, cleanup, and credit
  convergence into one opaque durable step.
- Feedback eligibility depends on last-second runtime settlement even when a
  useful prefix of canonical turns may already be durable.
- Stage telemetry records duration and outcome but not enough allowlisted
  reason detail to separate absence, timeout, degraded evidence, and replay.

## Reliability invariants

- At most one transcript hydration is in flight per mounted session client.
- Normal transcript display is event-driven; full reads are initial hydration
  or explicit reconnect/integrity recovery only.
- Every network and database dependency has a smaller deadline than its caller.
- An accepted End command never depends on the browser remaining mounted.
- Every background stage is idempotent and can resume after the last committed
  boundary.
- Feedback uses only canonical persisted evidence and never infers missing
  speech from wall-clock room duration.
- A user sees a typed, bounded state: saving, queued, generating, completed,
  partial/skipped, delayed/recoverable, or unavailable.
- Operational events contain no identity, transcript, feedback content,
  provider payload, or credential.

## Target architecture

### During the interview

The runtime writes each finalized measured turn and advances durable writer
state. A post-persistence LiveKit notification updates the room UI. The browser
hydrates once on entry and requests a resync only after a confirmed reconnect
or detected sequence gap. A future incremental cursor can replace the current
full snapshot without changing ownership.

### At end

The API commits `ending/user_end` and a cutoff in one owner-scoped transaction,
then returns the lifecycle URL. The durable worker uses separate stage
boundaries:

1. Resolve the runtime writer at the cutoff.
2. Finalize the locked canonical transcript snapshot.
3. Dispatch eligible feedback from the committed outbox.
4. Schedule room cleanup.
5. Converge credit settlement.

Feedback dispatch is never gated by cleanup or credit convergence. Each stage
records a privacy-safe outcome and can be retried independently.

### Transcript settlement evolution

The durable end-state should eventually be resolvable without a fragile final
LiveKit round trip. Each writer generation will continuously store its last
committed sequence, health, and timestamp. End compares that watermark with
the cutoff and recorded gaps/interruptions. Missing or corrupted evidence
still fails closed. A partial-feedback policy for a sufficiently complete
verified prefix requires a separate product decision and rollout contract.

## Initial SLOs

| Stage                                  | Objective                                            |
| -------------------------------------- | ---------------------------------------------------- |
| End acceptance                         | p95 < 1s; p99 < 3s                                   |
| Terminalization                        | p95 < 10s; p99 < 30s                                 |
| Feedback dispatch after terminal truth | p95 < 5s                                             |
| Feedback completed                     | p95 < 45s; p99 < 90s                                 |
| Customer lifecycle reads               | p99 < 5s; hard deadline < 8s                         |
| Transcript hydration concurrency       | no more than one in flight per tab/session           |
| Indefinite loading                     | zero sessions beyond 90s without an actionable state |

These are engineering targets, not launch evidence. Preview and sanitized
Production measurements must validate or tune them before alert thresholds are
treated as stable.

## Delivery sequence

1. **SAV-380 — contain the read path.** Remove hydration fan-out; add client,
   auth, route, and transaction-local query deadlines; return retryable states.
2. **SAV-383 — split the finalizer.** Make settlement, terminalization,
   dispatch, cleanup, and credit stages independently durable and observable.
3. **SAV-381 — persist committed watermarks.** Remove last-second runtime
   availability as the sole proof of an otherwise durable transcript.
4. **SAV-382 — enforce SLOs and user states.** Add aggregation, alerts,
   runbooks, and bounded lifecycle presentation.

Each slice must land with Production-shaped fixtures and preserve the existing
fail-closed evidence boundary. Production rollout remains a human-owner
decision.
