# SAV-362 Portable Worktree Tooling

## Intent

- User request: Make repository-level worktree setup and two-laptop handoff more reliable.
- Product/user outcome: A developer can start or resume work from either laptop without stale bootstrap logic or ambiguous readiness.
- Why now: A current-main worktree failed because Codex executed setup embedded in an older anchor checkout.

## Slice

- Primary slice: Local tooling and agent developer experience.
- Secondary slices: Operational documentation and Git handoff diagnostics.
- Relevant skills: `meelni-codebase-architecture`, `meelni-engineering-memory`, `meelni-linear-workstream`, and `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: None.
- Child deliverable issue: SAV-362.
- Current Linear state: In Progress.

## Scope

- In scope: Target-worktree bootstrap launcher, deterministic fresh installs, split setup/runtime doctors, read-only handoff and worktree inventory, tests, and docs.
- Out of scope: Secret synchronization, provider mutations, Production actions, and automatic worktree deletion.
- Assumptions: Git, fnm, Python 3.12, and provider CLIs are installed and authenticated once per laptop.

## Product Lens

- Audience: The current solo developer and future Meelni contributors or coding agents.
- Activation/retention/monetization/growth lever: Faster, more reliable engineering iteration.
- Product Compass note: No customer-facing product behavior changes.

## Technical Plan

- Likely app files: None.
- Likely package/workflow files: `.codex/environments/environment.toml`, `conductor.json`, `package.json`, and local scripts/tests.
- Data or provider dependencies: Local Git metadata only; runtime readiness reads secret presence but never values.
- Docs/decisions to update: `docs/operations/tooling.md`; no decision record needed for this bounded tooling refactor.

## Validation

- Required commands: Targeted tooling tests, `npm run test:local`, `npm run validate:skills`, typecheck, lint, build, and `npm run verify:agent`.
- Optional/manual checks: Exact fresh Codex bootstrap with provider credentials removed; dirty and unpushed handoff cases.
- Fixtures or regression tests needed: Stale launcher delegation, install selection, handoff state, and worktree classification.

## Rollout

- Risk level: Medium because setup failures can block every new task.
- Backward compatibility: `npm run doctor` remains the strict runtime check; `npm run setup:local` remains supported.
- Metrics/events to watch: Fresh setup exit status and hosted CI only; no product analytics.
- Follow-up slice: Machine-specific anchor checkout and authentication remain operator responsibilities.
