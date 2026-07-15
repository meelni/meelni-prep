# SAV-190 Session Reconnect Recovery

## Intent

- User request: execute the complete stack-ranked relaunch plan with agents.
- Product outcome: recover brief voice transport drops without duplicate
  sessions, charges, transcripts, or feedback, and end prolonged drops once.
- Why now: SAV-190 blocks credit settlement and launch rehearsal.

## Slice And Tracking

- Primary slice: interview/session vertical slice.
- Secondary slices: LiveKit adapter, Inngest deadline, focused-room UI,
  operations evidence.
- Linear: Relaunch Readiness / SAV-190 / In Progress.
- Skills: LiveKit runtime, vertical slices, architecture, UI system,
  engineering memory, Linear, and PR prep.

## Scope

- In scope: fixed 30-second grace, signed provider events, persisted generation
  fencing, atomic timeout claim, same-room agent retention, safe session-only
  resume URL, reconnect/recovered/timeout UI, tests, migration, and runbook.
- Out of scope: relaunch flag activation, Preview provider rehearsal before
  isolation, and the full transcript-ingest identity migration owned by SAV-194.
- Assumption: the relaunch flag remains default-off.

## Validation And Rollout

- Automated: typecheck, core/integration/workflow/API tests, Python runtime
  contracts, migration preflight/tests, full CI check, production build.
- Manual: short/repeated loss, reload, killed tab, exact expiry, hard-deadline
  overlap, and one-row provider/billing/feedback evidence in isolated Preview.
- Risk: high; provider concurrency and billing-adjacent lifecycle behavior.
- Rollback: disable delivery/read adoption with the flag off; preserve additive
  columns and immutable lifecycle facts.
- Follow-up: SAV-194 must close transcript idempotency before SAV-190 is Done.
