# Stable Start And Usable Credit Settlement

Date: 2026-07-10
Linear: SAV-229
Status: locally verified; Preview rehearsal blocked; relaunch flag remains default-off

## Intent

- User request: make Meelni relaunch-ready without enabling the discontinued
  experience by default before it is safe.
- Product outcome: an ambiguous retry can never create or charge a second
  interview, and a credit is charged only after the candidate had a real chance
  to hear the first complete interviewer turn.
- Why now: SAV-228 made ledger mutations atomic. This slice defines the durable
  interview evidence that is allowed to settle that ledger.

## Slice

- Primary slice: interview/session start and credit settlement.
- Secondary slices: LiveKit dispatch recovery, transcript ingest, lifecycle
  activation, client retry state, schema migration, and operations preflight.
- Relevant skills: `meelni-vertical-slice-playbooks`,
  `meelni-livekit-interview-runtime`, `meelni-engineering-memory`,
  `meelni-codebase-architecture`, and `stripe-best-practices`.

## Scope And Ownership

- In scope: a required stable client attempt UUID, a canonical request
  fingerprint, deterministic session/room/reservation identities, one durable
  selected question, recoverable provider provisioning, candidate-presence
  gating before speech, a canonical usable-evidence marker, exactly-once credit
  consumption, pre-usable release, redacted preflight checks, and clean/upgrade
  PostgreSQL acceptance tests.
- Out of scope: provider terminal-event ingestion and post-start refund policy
  (SAV-230), Stripe refund/cancellation policy (SAV-231), and enabling the
  relaunch flag.
- Provider authority: the database owns attempt and settlement truth. LiveKit
  room/dispatch state is reconciled against deterministic database identities.
- Rollout authority: no Preview or Production mutation while Preview shares the
  Production database; SAV-226 remains the deployment gate.

## Durable Contract

Version-1 starts use the client `startAttemptId` as the session ID. They derive:

- room name: `interview-<startAttemptId>`;
- reservation key: `interview-start:<userId>:<startAttemptId>`;
- request fingerprint: SHA-256 of the canonical normalized launch intent;
- one persisted question link and one reservation correlated to the same user,
  session, and attempt.

The session records a versioned start contract, a recoverable provisioning
lease/state, acknowledged provisioning time, and immutable usable evidence.
Legacy version-0 rows remain readable and are never given fabricated attempt or
usable evidence.

A start replay with the same owner and fingerprint returns the same durable
session/config/question and a fresh participant token. A conflicting payload,
cross-user collision, mismatched dispatch, duplicate dispatch, or malformed
correlation fails closed. Provider work occurs after the durable attempt and
reservation commit and is recovered through a bounded lease plus deterministic
LiveKit reconciliation.

## Usable And Settlement Contract

An interview becomes usable only when both facts are durable:

1. canonical candidate-and-agent activation is stored on the session; and
2. a canonical interviewer transcript event is persisted with
   `delivery_state = 'delivered'` after the runtime waited for the expected
   candidate participant.

Partial, interrupted, user, legacy, textless, or integrity-marker events never
qualify. Activation and transcript ingestion both invoke the same idempotent
convergence workflow so either arrival order is supported.

Every settlement path locks in this order:

1. owning `app_user`;
2. `interview_session`;
3. `credit_reservation`;
4. grants and allocations in deterministic order.

The usable marker and consume transaction commit together. Equivalent replays
validate the stored evidence. Before usability, start/provisioning failures
release the reservation; after usability, user end, deadline, abandonment, or
feedback failure cannot release it. Consume and release races may produce one
terminal action, never both.

## Implementation Plan

1. Add migration `0012` and Drizzle contracts for versioned starts,
   provisioning leases, unique room/question/reservation correlation, and
   immutable usable evidence.
2. Add a transaction-scoped start store that creates or loads the stable
   attempt, reserves credit, persists question/config, claims provisioning, and
   validates exact replays.
3. Refactor the start workflow and LiveKit adapter to reconcile one deterministic
   room and dispatch, schedule one stable deadline, issue fresh tokens, and stop
   consuming at start.
4. Add one client attempt-state helper and use it from setup and the legacy
   interview entry so ambiguous failures retain the same attempt.
5. Add the user-first usable-settlement transaction and invoke it after both
   canonical activation and transcript created/existing outcomes.
6. Make the Python runtime wait for the expected candidate before the greeting;
   remove terminalization's synthetic activation from arbitrary transcript
   counts.
7. Extend preflight, migration, workflow, integration, browser-state, and Python
   tests, then run an independent P0/P1 audit.

## Validation

- Same-attempt sequential, response-loss, and concurrent retries create one
  session, question, reservation, room, dispatch, and deadline identity.
- Same attempt with a changed fingerprint or owner fails without new side
  effects; distinct attempts racing for the final credit produce one winner.
- Activation-first, turn-first, and concurrent arrivals consume exactly once.
- Partial/user/legacy turns never consume; a settlement failure is retryable
  from an equivalent transcript or activation replay.
- Pre-usable release racing with usable settlement yields release or consume,
  never both, and repeated lock stress produces no deadlock.
- Required commands: focused workflow/integration/billing/client/Python tests,
  application and test typechecks, real clean/upgrade PostgreSQL migration
  tests, `npm run check:ci`, `npm run build`, and independent audit.

## Verification Evidence

- Schema fingerprint:
  `57ad88f0a2dbe151871d7a6e93af0417b02498aa9da6fe532e651fa4ed0110a1`.
- PostgreSQL 17 clean and legacy-upgrade migrations pass, including concurrent
  same-attempt starts, final-credit races, both usable-signal arrival orders,
  exact lease/deadline fencing after real row-lock waits, concurrent settlement
  replay, stale recovery, strict preflight, and version-1 account deletion.
- `npm run check:ci`, application/test typechecks, lint, Semgrep, the production
  build, 54 Python runtime tests, agent verification, and focused start/token
  regressions pass locally.
- Independent engineering review found no P0. Its P1 findings were closed,
  including expired-worker acknowledgement, ambiguous commit acknowledgement,
  deletion lock ordering, relaunch-gate coverage, post-lock database wall-clock
  authorization, non-destructive transient authorization failure, and
  post-sign token expiry fencing.
- Independent product/operations review confirmed the callback-origin gap is
  closed in code by trusted `VERCEL_URL` derivation with a non-development
  fail-closed fallback.

## External Launch Gates

- SAV-226 must provide a Preview Supabase project distinct from Production
  before remote migration or rehearsal. Current guards correctly forbid the
  shared target.
- SAV-184 must provision `INNGEST_EVENT_KEY` in the intended Vercel scopes and
  verify acknowledged deadline delivery. Production start intentionally fails
  closed without it.
- Keep `MEELNI_REACTIVATION_DEFAULT=false` and the Statsig relaunch gate off
  until both gates pass and the Preview golden path is rehearsed.

## Rollout And Rollback

Risk is high because this spans billing, lifecycle, database, and provider
boundaries. The migration is additive and versioned. Rollback reverts the
application while retaining version-1 rows and constraints; old writers remain
version 0. The relaunch flag stays default-off until SAV-226 provides isolated
Preview data and the full launch rehearsal passes.
