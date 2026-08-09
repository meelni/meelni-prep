# SAV-403: Restore The Repository Prettier Baseline

## Intent

- User request: Restore a clean repository-wide Prettier baseline after SAV-391 exposed 337 existing violations.
- Product/user outcome: Formatting checks reliably catch new regressions instead of reporting permanent repository debt.
- Why now: The noisy baseline obscures whether a PR introduced formatting drift.

## Slice

- Primary slice: Repository engineering hygiene.
- Secondary slices: CI reliability and agent workflow.
- Relevant skills: `meelni-linear-workstream`, `meelni-engineering-memory`, and `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: None.
- Child deliverable issue: SAV-403.
- Current Linear state: In Progress.

## Scope

- In scope: Inventory the baseline, format active repository-owned files with pinned Prettier 3.6.2, and narrowly exclude generated or immutable historical paths.
- Out of scope: Semantic behavior changes, dependency upgrades, generated snapshot rewrites, archive cleanup, provider or environment changes, Production actions, and customer data.
- Assumptions: The existing Prettier configuration and lockfile-resolved version remain authoritative.

## Product Lens

- Audience: Engineers and coding agents contributing to Meelni.
- Activation/retention/monetization/growth lever: Indirect delivery reliability.
- Product Compass note: This is repository hygiene with no customer-facing product change.

## Technical Plan

- Likely app files: Active TypeScript and TSX paths reported by Prettier.
- Likely package/workflow files: Active packages, scripts, tests, docs, configuration, and canonical skills reported by Prettier.
- Data or provider dependencies: None.
- Docs/decisions to update: This intake and the code-quality operations contract; no decision record is warranted for routine cleanup.

## Failure Inventory

The clean `origin/main` baseline at `42357cdb` reports 337 paths with Prettier 3.6.2:

| Class                                                                              | Paths | Treatment                                                                          |
| ---------------------------------------------------------------------------------- | ----: | ---------------------------------------------------------------------------------- |
| Active repository-owned source, tests, docs, scripts, config, and canonical skills |   187 | Format with the pinned repository Prettier                                         |
| Archived and legacy sprint execution records                                       |    96 | Ignore by their existing archive/sprint roots to preserve them byte-for-byte       |
| Completed Superpowers plans and specs                                              |     9 | Ignore by their historical planning roots                                          |
| Generated Drizzle migration metadata                                               |    21 | Ignore `lib/db/migrations/meta/`; the migration generator owns these snapshots     |
| Generated calibration bundle                                                       |     1 | Ignore `scripts/generated/`; its build script owns the bundle                      |
| Browser screenshot result artifact                                                 |     1 | Ignore `docs/design/screenshots/`; the browser evidence workflow owns the artifact |
| Legacy Claude agent and command tooling                                            |    14 | Ignore its exact tool-owned roots because Markdown formatting changes instructions |
| Retired sprint templates                                                           |     7 | Ignore `docs/templates/SPRINT_TEMPLATE/` with the legacy sprint tooling            |
| Legacy provider-backed integration script                                          |     1 | Ignore its exact path to avoid reintroducing its tracked public token in a diff    |

The exclusions are ownership boundaries, not a way to suppress active formatting debt. Direct SQL migrations, active architecture decisions, contracts, operations docs, application code, packages, tests, scripts, and canonical `.agents/skills` remain checked.

## Validation

- Required commands: `npm run format:check`, `git diff --check`, `npm run typecheck`, `npm run typecheck:tests`, `npm run lint`, `npm run test:local`, `npm run validate:skills`, and `npm run verify:agent` when feasible.
- Optional/manual checks: Review representative TypeScript, TSX, JSON, Markdown, and Tailwind-class diffs for semantic stability.
- Fixtures or regression tests needed: None; the repository-wide formatter check is the regression gate.

## Rollout

- Risk level: Low-to-medium because the diff is broad but mechanical.
- Backward compatibility: No runtime behavior or data contract changes.
- Metrics/events to watch: Exact-head GitHub and Vercel checks only; no product metrics are affected.
- Follow-up slice: None unless validation identifies a path that cannot safely join the checked baseline.
