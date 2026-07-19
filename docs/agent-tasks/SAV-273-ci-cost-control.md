# SAV-273 — Remove redundant post-merge Validate

## Intent

- User request: Keep executing relaunch work without exhausting GitHub Actions.
- Product/user outcome: Every protected merge receives one full clean-machine
  validation, without paying to rerun the identical merged tree on `main`.
- Why now: PR #353 used 9m48s after merge to retest the exact tree already
  validated by its required pull-request merge-ref run.

## Slice

- Primary slice: CI cost control.
- Secondary slices: Repository protection and engineering memory.
- Relevant skills: `meelni-linear-workstream`, `meelni-engineering-memory`,
  `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-259.
- Child deliverable issue: SAV-273.
- Current Linear state: In Progress.

## Scope

- In scope: Remove the full-CI `main` push trigger; preserve ready-PR and manual
  validation under distinct required and manual context names; pin the behavior
  in tests and operations docs.
- Out of scope: Changing branch protection, publisher triggers, provider state,
  Production, billing behavior, feature flags, or launch state.
- Assumptions: Strict up-to-date protection and admin enforcement remain active;
  GitHub continues to validate the generated PR merge ref.

## Product Lens

- Audience: Meelni operators and coding agents.
- Lever: Faster, sustainable relaunch execution without weaker merge coverage.
- Product Compass note: Operational efficiency with evidence-preserving gates.

## Technical Plan

- App files: None.
- Workflow files: `.github/workflows/ci.yml`.
- Tests: `scripts/ci-trigger-contract.test.mjs`.
- Provider dependencies: GitHub Actions and live branch-protection evidence only.
- Docs: `docs/operations/ci-cost-control.md` and this intake.

## Validation

- Required: CI trigger contract, local tooling suite, YAML parse, formatting,
  exact diff review, and one final hosted ready-PR Validate.
- Manual: Re-read live `main` protection and verify the first later protected
  merge starts no full push Validate.
- Regression fixture: Source contract proving no CI push trigger and preserved
  stack/migration `main` publisher trigger.

## Rollout

- Risk: Medium; removes redundant after-merge execution but not pre-merge proof.
- Backward compatibility: Manual full validation remains available.
- Watch: Actions run count/minutes and required-check enforcement.
- Rollback: Restore `push: main` in CI through a protected PR.
