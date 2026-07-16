# SAV-193 runtime integrity remediation

## Intent

- User request: complete the accepted relaunch-readiness work without enabling launch.
- Product/user outcome: interview feedback uses complete, correctly bounded transcript evidence and no raw transcript is retained by browser retry storage.
- Why now: the PR 260 closure audit found deadline, reconnect, replacement-writer, capacity, logging, and settings-truth gaps.

## Slice

- Primary slice: interview session / transcript privacy.
- Secondary slices: LiveKit runtime, server workflows, data contracts, settings truth, operations.
- Relevant skills: `meelni-livekit-interview-runtime`, `meelni-vertical-slice-playbooks`, `meelni-codebase-architecture`, `meelni-engineering-memory`, `meelni-ui-design-system`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-166.
- Child deliverable issue: SAV-193.
- Current Linear state: In Progress.

## Scope

- In scope: pre-output writer registration, writer-scoped evidence and settlement, exact-cutoff settlement, reconnect settlement handshake, reserved control capacity, content-redacted logs, truthful transcript settings/disclosure, canonical no-store transcript reads, and migration/runbook truth.
- Out of scope: launch activation, Production/live actions, evaluation calibration calls, and the separate analytics-consent workstream.
- Assumptions: only the owner can launch; relaunch remains feature-gated off; synthetic fixtures only.

## Technical Plan

- App/provider boundaries: trusted internal transcript ingest and LiveKit server control adapter.
- Domain/data: registered writer generations and writer-scoped settlement evidence.
- Runtime: shared flush operation for browser RPC, deadline enforcement, and trusted server reconnect requests.
- Product: no browser transcript write/retry path; explain required transcript storage truthfully.
- Docs: transcript contract, operations runbooks, migration inventory, and this OpenSpec change.

## Validation

- Required: `npm run check:ci`, `npm run build`, `npm run test:python-agent`, `npm run test:database-migrations`, focused auth/runtime/API tests, and exact-head hosted checks once locally merge-ready.
- Fixtures: hard deadline with post-cutoff cleanup; missing/degraded replacement writer; reconnect settlement success/failure; full data queue plus control watermark; content-log sentinel; cross-user transcript read; browser no-write.
- Local evidence (2026-07-15): `npm run check:ci` passed on the combined PR head, including lint, application/test typechecks, dependency boundaries, Semgrep (0 findings across 686 tracked targets), 324 workflow/database/privacy tests, 111 API tests, 25 auth/UI tests, billing, operations, content, legal, and package-entrypoint gates.
- Focused evidence: the interview lifecycle suite passed 5/5; `npm run test:auth-ui` passed its 7 Node tests and 25 Vitest tests; `npm run db:check` passed after reconciling the Drizzle snapshot's transcript ordering indexes with schema and executable SQL.
- Additional local evidence: `npm run build` passed with 68 static pages and an 80-route public manifest; `npm run verify:agent` passed; the Python runtime suite passed 62/62; direct interview/demo entrypoint checks passed; and the disposable PostgreSQL 17.10 clean/upgrade migration harness passed with final fingerprint `b88622c7a970d748f058dd1c5eaa71e0ef31651c49505c2604bada48965b9b67` and confirmed database cleanup.
- Remaining before close: exact-head hosted checks and the isolated Preview rehearsal. Production and relaunch activation remain out of scope.

## Rollout

- Risk: high; transcript truth controls feedback eligibility.
- Backward compatibility: legacy transcript rows remain readable, but relaunch runtime writers must use the registered generation contract.
- Metrics: metadata-only settlement state, writer counts, failure codes, and room-cleanup outcome; never transcript content.
- Follow-up: separate analytics consent and provider-retention review remain launch blockers outside SAV-193.
