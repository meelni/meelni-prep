# Canonical Interview Session Lifecycle — SAV-187

Status: canonical contract and foundational implementation; downstream end/deadline/reconnect adoption remains open

## Intent

- User request: make every interview session converge on one reliable, explainable outcome before relaunch.
- Product/user outcome: users can start, reconnect, end, time out, or fail without the browser, realtime provider, feedback job, and billing system disagreeing about the session.
- Why now: SAV-187 is a launch-critical dependency for atomic completion, hard deadlines, reconnect recovery, credit settlement, transcript ingest, and the final feature-flag rehearsal.

## Slice

- Primary slice: interview session contract.
- Secondary slices: room-metadata correlation, transcript/feedback handoff, credit-settlement boundary, agent tooling fixtures.
- Relevant skills: `meelni-engineering-memory`, `meelni-livekit-interview-runtime`, `meelni-vertical-slice-playbooks`.
- User/operator outcome: one provider-neutral lifecycle and one terminal winner.
- Primary workflow owner: `transitionInterviewSessionWorkflow` in the web/backend workflow boundary.

## Linear Tracking

- Project: Meelni.
- Parent slice: SAV-166 — make every PM interview session complete reliably.
- Deliverable: SAV-187 — define a canonical interview lifecycle and terminal reasons.
- Current state at intake: In Progress.
- Blocks: SAV-188, SAV-189, SAV-190, SAV-191, and SAV-176.
- Related: SAV-194 and SAV-146.

## Scope

### In scope

- States: `created`, `connecting`, `active`, `reconnecting`, `ending`, `completed`, `abandoned`, `failed`.
- Reasons: `user_end`, `time_limit`, `disconnect_timeout`, `provider_failure`, `insufficient_signal`.
- Versioned transition and first-terminal-writer semantics.
- Ownership boundaries for browser, workflow, provider adapter, voice runtime, transcript, feedback, deadline, and billing.
- Legacy projection/backfill and rollout/rollback guidance.
- Provider-neutral lifecycle scenarios under `@meelni/test-fixtures`.
- Durable contract and verification matrix.

### Out of scope

- Interview-room redesign, provider changes, feedback rubric changes, or pricing policy.
- Atomic end-session adoption (SAV-188).
- Server-owned hard deadlines (SAV-189).
- Durable disconnect/reconnect transitions beyond the join authorization boundary (SAV-190).
- Terminal-outcome credit settlement (SAV-191).
- Transcript-ingest ownership, ordering, and idempotency (SAV-194).
- Closing the relaunch gate before downstream implementation and rehearsal evidence passes.

### Assumptions

- `packages/core/src/session-lifecycle.ts` owns domain states, reasons, transition validation, legacy projection, and terminal arbitration.
- `packages/agent` owns versioned room-metadata parsing but not lifecycle state.
- `lib/workflows/transition-interview-session.ts` owns versioned transition orchestration and `lib/db/session-lifecycle.ts` owns compare-and-set persistence.
- Existing `interview_session.status` remains a compatibility projection during migration.

## Product Lens

- Audience: PM candidates completing a live voice mock interview.
- Primary lever: product quality and activation reliability.
- Product Compass note: a completed practice artifact is credible only when the session outcome and durable signal agree; no readiness claim depends on this lifecycle.

## Baseline Findings And Remaining Gaps

The SAV-187 implementation addresses the foundational split by adding the core state machine, persistence fields, forward migration/backfill, compare-and-set store, transition workflow, start-path transitions, canonical join authorization, strict metadata validation, and runtime-event contracts.

Remaining downstream gaps are intentionally separate:

- Browser state creates and joins the session, persists transcript events through an authenticated client queue, and submits explicit end intent.
- Reconnect authorization now reads canonical joinable states, but runtime transport-loss/recovery commands and grace expiration remain SAV-190.
- The browser timer opens an end modal; it is not a server-owned hard deadline.
- The legacy end route still sets `endedAt`, calculates signal, and queues feedback. Moving it to the canonical atomic transition path is SAV-188.
- Feedback therefore currently participates in session completion even though it should be a downstream consumer.
- Realtime transcript packets are best-effort transport and are not durable until the app acknowledges persistence.

The migration and implementation on this branch still require the full validation suite and deployment rollout before they are production truth.

## Contract Decision

- The session workflow is the only lifecycle writer.
- All terminal claims pass through `ending` and require a terminal reason.
- Terminal state is derived from reason and historical activation; callers cannot choose a contradictory result.
- The first valid versioned terminal claim wins. Equivalent retries are idempotent; incompatible concurrent claims return the stored winner as a conflict.
- Lifecycle versions start at `1` on the created row; the first accepted transition writes `2`.
- Terminal states never reopen.
- Feedback and credit workflows consume the outcome and never decide it.
- Provider-native states are normalized signals, not domain states.

The complete behavior is in `docs/contracts/interview-session-lifecycle.md`.

## Implementation Layers And Files

- Core state machine and session contract:
  - `packages/core/src/session-lifecycle.ts`
  - `packages/core/src/session-lifecycle.test.ts`
  - `packages/core/src/session.ts`
  - `packages/core/src/index.ts`
- Agent metadata/runtime contracts:
  - `packages/agent/src/room-metadata.ts`
  - `packages/agent/src/runtime-events.ts`
  - `packages/agent/src/contracts.test.ts`
  - `packages/agent/src/index.ts`
  - `agent/shared/config.py`
  - `agent/shared/runtime_events.py`
  - `agent/test_runtime_contracts.py`
- Persistence, migration, and transition workflow:
  - `lib/db/schema.ts`
  - `lib/db/session-lifecycle.ts`
  - `lib/db/session-lifecycle.test.ts`
  - `lib/db/migrations/0006_interview_session_lifecycle.sql`
  - `lib/db/migrations/meta/0006_snapshot.json`
  - `lib/db/migrations/meta/_journal.json`
  - `lib/workflows/transition-interview-session.ts`
  - `lib/workflows/transition-interview-session.test.ts`
  - `lib/workflows/start-session.ts`
  - `lib/workflows/start-session.test.ts`
  - `lib/workflows/join-interview-session.ts`
  - `lib/workflows/join-interview-session.test.ts`
  - `lib/db/sessions.ts`
  - `lib/types/session.ts`
  - `lib/db/queries/user-stats.ts`
- Migration/schema verification:
  - `scripts/database-migration-preflight.ts`
  - `scripts/database-schema-contract.ts`
  - `scripts/test-database-migrations.ts`
- Engineering memory and fixtures:
  - `docs/contracts/interview-session-lifecycle.md`
  - `docs/contracts/README.md`
  - `docs/contracts/livekit-room-metadata.md`
  - `docs/superpowers/plans/2026-07-09-canonical-session-lifecycle.md`
  - `packages/test-fixtures/src/session-lifecycle.ts`
  - `packages/test-fixtures/src/session-lifecycle.test.ts`
  - `packages/test-fixtures/src/index.ts`
  - Directly relevant lifecycle statements in agent runtime guidance when they conflict with current ownership.

## Provider And Data Dependencies

- Realtime provider adapter: runtime start, ready, transport loss/recovery, and provider failure signals.
- Supabase/Postgres: versioned lifecycle persistence, atomic compare-and-set writes, legacy projection, and guarded backfill.
- Browser: authenticated user intent and transcript persistence acknowledgements.
- Background workflow/deadline runner: hard deadline, reconnect grace, and terminal finalization.
- Feedback/Inngest: downstream consumer after lifecycle terminalization.
- Credit ledger: downstream settlement keyed by the immutable outcome.

No secret, token, transcript text, provider credential, or customer data belongs in lifecycle logs or fixtures.

## Compatibility And Backfill

- Keep the legacy `status` projection during dual-write rollout.
- Introduce `legacy_unknown` only when importing a historical terminal cause that cannot be proved.
- Never emit `legacy_unknown` for a new session.
- Dry-run the backfill, preserve row counts, report state/reason counts, and prove reruns are no-ops.
- Do not infer activation or provider failure from `in_progress` alone.
- Retain canonical facts during rollback; disable reads/enforcement rather than rewriting history.

## Delivery Order

1. Core contract, fixtures, metadata/runtime-event contracts, canonical persistence, guarded backfill, CAS workflow, and start/join adoption — SAV-187.
2. Atomic end-session workflow using the canonical transition path — SAV-188.
3. Server-owned duration/deadline transitions — SAV-189.
4. Durable reconnect transitions and grace handling — SAV-190.
5. Credit settlement from terminal outcomes — SAV-191.
6. Transcript-ingest ownership/order/idempotency alignment — SAV-194.
7. Production shadow-read comparison, transition enforcement, feature-flag rehearsal, and launch decision — SAV-176.

## Rollout And Rollback

- Risk: high; lifecycle mistakes can lose interviews, credits, transcripts, or feedback.
- Apply migration `0006` and confirm the seven-entry `reconciled` preflight
  before deploying code that selects or writes the new lifecycle fields.
- Start with core tests and fixtures, then Preview dual writes and shadow reads.
- Emit divergence and invalid-transition metrics before rejecting legacy behavior.
- Enable canonical reads only after fixtures and Preview end-to-end checks pass.
- Keep the public relaunch gate default-off throughout open lifecycle work.
- Roll back reads/enforcement and keep canonical data intact if divergence, stuck-state, or conflict rates exceed the launch threshold.

## Observability

Record safe structured transition data: session ID, command ID, version, from/to state, terminal reason, activation fact, source, normalized signal, outcome, timestamps, and runtime reference. Never record transcript content or credentials.

Watch transition/error counts, stuck nonterminal states, start-to-active latency, reconnect recovery, terminal reason mix, conflicts, invalid edges, legacy divergence, and downstream attempts to mutate terminal sessions.

## Verification Matrix

| Layer                | Automated evidence                                                                                                                                       | Manual/Preview evidence                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Core contract        | Exhaustive state edges, reason derivation, terminal immutability, first-writer arbitration                                                               | Review state/reason table with product and engineering owners          |
| Fixtures             | Normal completion, provider-start failure, insufficient signal, reconnect recovery, disconnect timeout, hard deadline, invalid reopen, concurrent claims | Use fixtures to drive each downstream ticket before close              |
| Metadata             | Version and required session correlation; reject malformed/unsupported payloads                                                                          | Start a selected-question interview and correlate session/runtime/logs |
| Persistence/backfill | Clean and legacy migration tests; counts and rerun idempotency                                                                                           | Production read-only preflight before migration                        |
| SAV-187 workflow     | CAS/idempotency/conflict tests, `created → connecting`, provider-start failure, canonical join authorization                                             | Preview successful start and fail-closed provider/metadata path        |
| Downstream workflows | End, reconnect, deadline, transcript, feedback, and credit tests in SAV-188/189/190/191/194                                                              | Verified in each owning ticket                                         |
| Rollout              | Canonical/legacy shadow comparison                                                                                                                       | Feature-flag activation and rollback rehearsal in SAV-176              |

## Required Checks Before SAV-187 Closes

- `npm run check:ci`
- `npm run build`
- `npm run test:python-agent`
- `npm run test:database-migrations` against the guarded disposable PostgreSQL test database
- `npm run test:fixtures`
- `npm run test:core`
- Targeted Prettier check for changed docs and fixtures.
- `git diff --check`

Manual Preview verification must correlate one successful start and one fail-closed metadata/provider-start path without exposing tokens or transcript content. Downstream end, deadline, reconnect, transcript, credit, and launch-rehearsal behavior is verified in its owning ticket rather than being implied by SAV-187.

## Verification Evidence — 2026-07-09

- `npm run check:ci`: passed. This included formatting-quality checks, lint, application and test typechecks, Biome, dependency/architecture checks, Semgrep with zero findings, quality tests, and the core, agent, integration, fixture, workflow, billing, and package-entrypoint suites.
- `npm run build`: passed and generated all routes. Existing non-blocking warnings remain for the deprecated Next.js middleware convention, the broad dynamic env-file trace in the question-sync route, edge-runtime static generation, and absent build-time PostHog configuration.
- `npm run test:python-agent`: passed, 9 tests.
- `npm run test:agent`: passed, 11 tests.
- `npm run test:core`: passed, 31 tests.
- `npm run test:fixtures`: passed, 8 tests, including five new lifecycle-contract checks.
- `npm run test:database-migrations`: passed against a disposable loopback PostgreSQL 17 database; clean install, legacy upgrade, and repeat migration verification produced schema fingerprint `3953f5a151a268941ed48bacb0ed15bf7c4016026ecab249189ec367e0a39ab3`. The disposable container was stopped and removed afterward.
- Targeted Prettier check: passed for the new lifecycle docs and fixtures plus the actively maintained agent README and contract files. The historical `.claude/LIVEKIT.md` guide retained its existing formatting with only an authority notice added.
- `git diff --check`: passed.

Manual Preview runtime correlation remains open and belongs in the deployment/rollout handoff before SAV-187 closes.
