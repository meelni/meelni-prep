# SAV-194 Transcript Ingest

## Intent

- User request: execute the complete stack-ranked relaunch plan with agents.
- Product outcome: every real interview utterance is stored exactly once,
  ordered deterministically, and available as trustworthy feedback evidence.
- Why now: SAV-194 blocks transcript privacy, feedback v2, reconnect readiness,
  and launch rehearsal.

## Slice And Tracking

- Primary slice: transcript ingest and durable interview evidence.
- Secondary slices: authenticated API, browser retry settlement, session
  terminalization, feedback ordering, migration verification, and operations.
- Linear: Relaunch Readiness / SAV-194 / In Progress.
- Skills: feedback/evaluation, vertical slices, architecture, engineering
  memory, Linear, and PR prep.

## Scope

- In scope: canonical v2-only persistence, global event identity, writer
  sequence fencing, ownership and room correlation, deterministic ordering,
  immutable canonical rows, bounded explicit-end settlement, tests, migration,
  and contract documentation.
- Out of scope: changing PM interview content or scoring, persisting legacy
  packets, and the SAV-193 move away from browser transcript storage.
- Assumption: the relaunch flag remains default-off.

## Validation And Rollout

- Automated: workflow/API tests, real concurrent PostgreSQL ingest tests,
  clean/legacy migration verification, TypeScript/Python contract tests, full
  CI check, and production build.
- Manual: duplicate delivery, identical repeated text, out-of-order arrival,
  cross-session payload, reconnect retry, explicit-end drain, and transcript /
  feedback ordering in isolated Preview.
- Risk: high; transcript evidence feeds terminal eligibility and AI feedback.
- Rollback: keep the flag off and stop canonical writes; additive nullable
  columns preserve legacy rows and must not be destructively rolled back.
- Follow-up: SAV-193 removes raw browser persistence and moves heard
  interruption handling onto the canonical identity contract.
