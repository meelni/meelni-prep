# SAV-268 — Forward-reconcile the Preview migration lineage

## Intent

- User request: Continue relaunch-readiness work without rewriting the historical Preview database or enabling launch.
- Product/user outcome: The isolated Preview database can adopt the reviewed consent, runtime-ownership, and public-demo deadline hardening through a safe forward-only migration.
- Why now: Preview recorded the original 0023–0025 files before their PR branches were hardened, so merging the reviewed stack requires an explicit convergence path.

## Slice

- Primary slice: Forward-only database lineage reconciliation.
- Secondary slices: Analytics-consent evidence, runtime transcript ownership, public-demo token deadlines, migration preflight, and operational documentation.
- Relevant skills: `meelni-codebase-architecture`, `meelni-livekit-interview-runtime`, `meelni-engineering-memory`, `meelni-linear-workstream`, `meelni-vertical-slice-playbooks`, `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-164.
- Child deliverable issue: SAV-268.
- Current Linear state: In Progress.

## Scope

- In scope: Canonical migration 0026; exact historical/canonical 0023–0025 vector validation; consent revision backfill; runtime and demo ownership normalization on the historical path; persisted two-minute demo deadlines; five-second delivery fences; strict preflight and immutable historical fixtures.
- Out of scope: Applying any migration to Preview or Production, changing a recorded ledger row, enabling Statsig controls, invoking LiveKit/model providers, or making the launch decision.
- Assumptions: Preview contains either the exact observed historical tail vector or the exact reviewed canonical vector. Any mixed hash, partial schema, active old demo token, or unknown drift must fail closed.

## Product Lens

- Audience: Relaunch reviewers and future candidates using the two-minute public voice preview.
- Activation/retention/monetization/growth lever: Preserve a trustworthy activation preview without weakening privacy or provider-spend controls.
- Product Compass note: This is operational safety work; customer-facing language remains live PM interview practice, never a gym or reps.

## Technical Plan

- Likely app files: None.
- Likely package/workflow files: Drizzle migration/journal/snapshot, migration preflight, PostgreSQL acceptance suite, immutable database fixtures.
- Data or provider dependencies: Local PostgreSQL only during implementation. No shared database or provider mutation.
- Docs/decisions to update: Migration history, migration runbook, transcript deployment runbook, and this intake.

## Validation

- Required commands: `npm run db:check`, `npm run test:database-migrations`, typechecks, targeted ESLint, `npm run test:local`, `npm run test:operations`, formatting, and diff checks.
- Optional/manual checks: Read-only Preview strict preflight after review; migration application only with separate owner authorization.
- Fixtures or regression tests needed: Exact old-file hashes; canonical and historical clean convergence; mixed-vector rejection; active-token drain rejection; consent 0/1/1 backfill; owner repair; immutable ledger prefix; public-demo deadline/recovery behavior; final strict count-27 contract.

## Rollout

- Risk level: High database/security impact; fail closed.
- Backward compatibility: Canonical databases receive a verified semantic no-op. Historical Preview converges additively and retains every prior ledger row. The relaunch gate remains off.
- Metrics/events to watch: Migration/preflight status, active-demo drain state, schema fingerprint, unsafe-owner count, and public-demo denial/cleanup health—never tokens, identifiers, transcripts, or credentials.
- Follow-up slice: Review and merge the stacked migration PRs in order, then separately authorize and rehearse the Preview migration. Launch activation remains owner-only.
