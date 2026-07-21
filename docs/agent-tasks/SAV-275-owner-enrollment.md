# SAV-275 Owner Enrollment and Artifact Tooling

## Intent

- User request: prepare safe owner key/executor enrollment and artifact-signing
  tooling without making provider or Production calls.
- Product/user outcome: the human owner can issue short-lived, one-use,
  exact-candidate Production authorizations without sharing private material.
- Why now: guarded Production entrypoints intentionally fail closed until an
  owner key and executor are enrolled.

## Slice

- Primary slice: agent tooling and Production authorization operations.
- Secondary slices: security boundary, release operations, engineering memory.
- Relevant skills: `meelni-ops-connections`, `meelni-engineering-memory`, and
  `meelni-vertical-slice-playbooks`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-254.
- Child deliverable issue: SAV-275.
- Current Linear state at implementation start: In Progress.

## Scope

- In scope: external mode-`0600` Ed25519 private key and executor enrollment;
  public registry output; exact-bound unsigned payload preparation; local
  signing and verification; synthetic exact-binding, mutation, expiry, and
  replay proof; all-worktree/Git-common-dir path custody; recoverable public
  entry inspection; signing-key-only rotation; owner runbook and revocation
  guidance.
- Out of scope: enrolling the real owner key, changing the tracked key registry,
  making provider/Production calls, consuming a real authorization, enabling
  relaunch default-on, or making a launch decision.
- Assumptions: the human owner retains sole custody of private material and
  separately reviews the public-key registry change.

## Product Lens

- Audience: the human product owner and authorized Production operator.
- Activation/retention/monetization/growth lever: launch safety and operational
  trust, not a customer-facing feature.
- Product Compass note: this tooling grants a narrow action authorization only;
  launch GO/NO-GO remains human-owner-only.

## Technical Plan

- App files: none.
- Package/workflow files: owner tooling module and CLI, existing authorization
  helper exports, package scripts, behavior tests.
- Data or provider dependencies: none for implementation or synthetic proof.
- Docs/decisions to update: authorization contract and operating runbook. The
  existing accepted authorization decision remains unchanged.

## Validation

- Required commands: targeted authorization tests, full operations tests,
  synthetic dry-run, lint/format checks, and `git diff --check`.
- Optional/manual checks: human review of CLI output and canonical external
  paths before real enrollment.
- Fixtures or regression tests needed: temporary synthetic Ed25519 material,
  exact candidate/config/target binding, mutation, expiry, permissions, and
  replay rejection; Git common-directory, sibling-worktree, symlinked-ancestor,
  partial-write retry, public-entry recovery, and signing-key rotation cases.

## Rollout

- Risk level: high for eventual use; provider-free implementation is inert.
- Backward compatibility: existing guarded entrypoints and empty registry keep
  failing closed until the owner completes enrollment.
- Metrics/events to watch: none before provider use; preserve authorization
  denial codes and the local consumption ledger during future execution.
- Follow-up slice: owner-reviewed public-key enrollment, then a separately
  authorized Production rehearsal. Launch remains off.
