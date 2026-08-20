# SAV-480 Durable Preview-Shadow Control Plane

## Intent

- User request: Implement the durable server-owned authority that the accepted
  Preview-shadow execution gate deliberately left unshipped.
- Product/user outcome: A later separately authorized Preview-shadow rehearsal
  can receive one bounded session lease before any LiveKit room, worker, or
  provider construction, while replay, aggregate spend, and recovery remain
  authoritative across processes and restarts.
- Why now: SAV-479 merged the strict authorization, lease, receipt, incident,
  and reference-transition contracts but intentionally cannot enforce them
  durably.

## Slice

- Primary slice: agent tooling and rollout control plane.
- Secondary slices: service-only PostgreSQL persistence, server workflow, and
  LiveKit pre-room admission boundary.
- Relevant skills: `meelni-linear-workstream`,
  `meelni-livekit-interview-runtime`, `meelni-ops-connections`,
  `meelni-codebase-architecture`, `meelni-vertical-slice-playbooks`,
  `meelni-engineering-memory`, and `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni coding-agent workstream.
- Parent slice issue: SAV-476 remains open.
- Child deliverable issue: SAV-480.
- Current Linear state: In Progress; the supervisor owns Linear writes because
  the worker connector requires reauthentication.

## Scope

- In scope: a versioned injected Ed25519 owner-decision verifier; one-time
  activation CAS; durable run, lease, terminal receipt, stop-incomplete,
  stop-event, and termination-ack state; conservative integer nano-USD caps;
  capability-authenticated worker/control evidence; loopback PostgreSQL
  concurrency, retry, crash, restart, recovery, and privacy tests.
- Out of scope: application or Python runtime wiring, environment or credential
  reads, provider calls, spend, deploys, LiveKit rooms/dispatches, flag changes,
  Preview influence, Production/default-on/GO, and a checked executable owner
  authorization.
- Assumptions: the existing `service_role`-only RLS pattern is the correct
  persistence boundary; the merged SAV-479 model remains a test oracle only;
  termination acknowledgement converges accounting but never reopens a stopped
  cohort.

## Product Lens

- Audience: the human owner and trusted server operators preparing a bounded
  interviewer-quality rehearsal.
- Activation/retention/monetization/growth lever: safer interviewer-quality
  iteration; no customer-facing behavior changes in this slice.
- Product Compass note: preserve realistic full-interview behavior and human
  rollout authority while making the next evidence stage operationally safe.

## Technical Plan

- Likely app files: none.
- Likely package/workflow files: a strict owner-decision verifier under
  `lib/security`, additive Drizzle schema and transactional store under
  `lib/db`, and a server-only orchestration facade under `lib/workflows`.
- Data or provider dependencies: additive migration 0043 against PostgreSQL;
  provider-free tests use only a disposable loopback PostgreSQL 17 database.
- Docs/decisions to update: this intake, OpenSpec, accepted decision, durable
  contract, runbook, migration contract, and validation evidence.

## Validation

- Required commands: focused TypeScript contracts; exact Node 22.22.0 agent,
  core, integrations, operations, database-migration, benchmark, feedback,
  calibration, check, verify:agent, build, and public-build gates; exact-range
  security diff scan.
- Optional/manual checks: none against a shared environment; no LiveKit or
  provider rehearsal is authorized.
- Fixtures or regression tests needed: signature and parser attacks; activation
  and allocation races; exact versus divergent replay after ambiguous commit;
  stale authorization/lease/revision; cap and upward-spend accounting; receipt,
  incident, event, and acknowledgement idempotency; process restart; token
  forgery/cross-lease replay; content-free persisted evidence.
- Terminal provider-free evidence:
  - strict verifier/evidence builders and workflow facade: 8 passed, including
    bounded artifact/authorization/key-registry inputs before date or crypto;
  - no-wiring/source contracts: 3 passed;
  - disposable PostgreSQL matrix: 6 FORCE-RLS tables plus activation,
    concurrency, restart, post-expiry exact replay, closed/revoked lease replay,
    run-control revocation, cap, rollback, role-denial, termination, and privacy
    scenarios passed;
  - full 44-migration rehearsal: 48 tables and schema fingerprint
    `6527d4c95a623e4759c92197f380e9bded41ca557165d4300e4e497fedc6cd48`;
  - agent 108, core 111, integrations 111, operations 46, benchmark 34,
    feedback 43, calibration 173, and pinned Python agent 322 passed with no
    focused skips;
  - exact calibration attestation remained 426 inputs, 1,488,348 bytes, SHA-256
    `d96158145f6a3cf89018247871ad2efff51bd2a27d3a6b2c8d596a6b9f9701e1`;
  - exact Node 22.22.0 check, Drizzle check, agent verification, production
    build, and public source/build verification passed.
- Evidence file:
  `docs/evidence/sav-480-durable-preview-shadow-control-plane-provider-free-validation.md`.

## Rollout

- Risk level: high because this is an authorization and spend-control boundary,
  despite remaining unwired.
- Backward compatibility: additive database objects and server-only modules;
  current application remains `adapter=None` with all adaptive flags false.
- Metrics/events to watch: none live in this slice. Future rollout must observe
  content-free activation, allocation, reconciliation, stop, incomplete-stop,
  and termination-ack receipts.
- Follow-up slice: independently review this exact head, merge it, then request
  a fresh exact-merged-SHA owner authorization before any separately scoped
  pre-room/runtime integration.
