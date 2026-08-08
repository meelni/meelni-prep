# Interview lifecycle reliability direction

Status: accepted and implemented on draft PR #525. The candidate has passed
provider-free, database, browser, hosted CI, and exact-head Preview health
checks. The open program parent is SAV-365; authenticated isolated-staging
rehearsal and human-owned rollout approval remain open.

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
- A later Production health response was green while aggregate runtime evidence
  still contained invalid Inngest signatures and lifecycle route failures. The
  source audit showed that health checked only nonblank Inngest configuration
  and old pending/sending dispatch claims, not sent-unclaimed events or expired
  generation leases.

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
- End Interview remains available during room reconnect/degradation; mute may be
  temporarily disabled when no controllable microphone connection exists.
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

### Transcript settlement boundary

The durable end-state no longer relies on a successful final LiveKit round
trip as its only evidence. Each writer generation continuously stores its
observed and gap-free committed sequence, health, and measured boundary. End
freezes those watermarks with the semantic cutoff and evaluates only that
immutable database prefix. A healthy, sufficiently complete prefix with
missing final settlement is explicitly partial; gaps, interruption markers,
degraded writers, malformed boundaries, and insufficient signal fail closed.
The runtime settlement remains useful exact-drain evidence, but provider
unavailability cannot veto the user's terminal intent.

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
5. **SAV-384 — bound start and canonical readiness.** Preserve one launch
   intent, separate transport from canonical activation, and keep a safe exit
   available through delayed readiness.
6. **SAV-386 — preserve interview controls.** Keep End Interview reachable
   during credential loading and reconnect while disabling only unsafe mute
   interaction.
7. **SAV-388 — close false-green feedback health.** Degrade readiness when a
   sent event is not claimed inside 90 seconds or generation exceeds its
   five-minute lease, while preserving fixed privacy-safe public codes.

Each slice must land with Production-shaped fixtures and preserve the existing
fail-closed evidence boundary. Production rollout remains a human-owner
decision.

## Verification status

| Boundary                            | Automated or hosted evidence                                                                                                                                                                                                                 | Remaining live evidence                                                                                                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stable start and credential handoff | Same-attempt replay, lost acknowledgement, bounded reads, token fencing, delayed canonical readiness, and no-token-churn tests pass.                                                                                                         | Authenticated warm start, simulated 20-second cold start, stalled provider read, and lost-response replay in isolated staging.                                               |
| Transcript durability               | Version-2 ingest, idempotency, writer registration, gaps, marker degradation, settlement, committed watermark, frozen prefix, and migration tests pass.                                                                                      | Observe signed Python runtime writes and frozen per-generation evidence for a real synthetic staging interview.                                                              |
| Explicit end                        | Acceptance-before-provider-work, bounded ambiguous client reconciliation, persistent End controls, independent finalizer checkpoints, and recovery tests pass.                                                                               | Measure acceptance and terminalization latency while exercising normal end and a deliberately dropped finalizer delivery in staging.                                         |
| Feedback dispatch and generation    | Ending/terminal room handoff, outbox fencing, stale queue identity rotation, generation leases, lease-aware health evidence, terminal repair, delayed/recovery UI, and completed/skipped/failed presentation tests pass.                     | Exercise unclaimed delivery, slow generation, partial/insufficient outcomes, and one recovery without duplicate evaluation in staging.                                       |
| Operational readiness               | Exact-head `npm run test:ci`, `npm run check`, PostgreSQL 17 migration rehearsal, hosted CI, isolated browser QA, and exact-PR Preview dependency health passed. Canonical staging is currently dependency-unhealthy and tracked by SAV-387. | Restore isolated staging, apply migration 0030, run the authenticated lifecycle rehearsal, and record privacy-safe stage events against database truth before tuning alerts. |

Automated evidence proves deterministic contracts and failure convergence; it
does not prove provider latency, webhook delivery, worker registration, or
cross-service credentials in the target environment. The remaining rehearsal
must use the isolated `staging` Vercel environment, Preview database and
LiveKit project, the exact candidate commit/ref, and the time-bounded Statsig
`meelni_preview_rehearsal_authority`. Enabling that authority or aligning the
staging branch is a separately owner-authorized action and is not implied by a
green PR.
