# SAV-238 Enterprise Repository Migration

## Intent

- User request: Move the exhausted personal repository to the Meelni Enterprise
  Cloud organization and restore optimized hosted validation.
- Product/user outcome: Relaunch engineering can obtain bounded exact-head CI
  evidence without funding runaway draft or scheduled workflows.
- Why now: The personal owner cannot start hosted jobs, and the open relaunch
  stack still requires clean-machine validation.

## Slice

- Primary slice: CI operations and repository ownership.
- Secondary slices: stacked-PR publication, provider GitHub Apps, engineering
  memory.
- Relevant skills: `meelni-linear-workstream`, `meelni-ops-connections`, GitHub
  CI repair.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-171.
- Child deliverable issue: SAV-238.
- Current Linear state: In Progress.

## Scope

- In scope: disable the unsafe workflow; transfer to `meelni/meelni-prep`;
  update canonical repository identity; remove unattended stepped-minute
  publication; use one dependency audit for meaningful draft movements while
  skipping draft body/title edits; combine manual sweeps; verify controls, PRs,
  and provider checks; restore bounded validation.
- Out of scope: Production provider changes, relaunch activation, live catalog
  changes, or launch approval.
- Assumptions: Enterprise Cloud billing is active for organization `meelni`.

## Technical Plan

- Workflow files: `.github/workflows/stack-topology.yml`,
  `.github/stacked-prs.json`.
- Tests: hosted trigger and trusted publisher source contracts.
- Operations docs: CI cost control, stacked PRs, and provider connections.
- Provider dependencies: GitHub organization policy and GitHub App access for
  Vercel, GitGuardian, Supabase, and Linear.

## Validation

- Run focused Node workflow/publisher tests and Prettier.
- Verify the transferred default-branch SHA and all open PR numbers.
- Verify protections, rulesets, environments, webhooks, and workflow state.
- Run one current-head hosted smoke validation after the safe workflow lands.

## Rollout

- Risk level: High operational risk, low product-behavior risk.
- Backward compatibility: GitHub redirects the former repository URL; local
  remotes and canonical registry still move explicitly.
- Metrics/events to watch: hosted job starts, billed minutes, publisher count,
  required-check conclusions, and external deployment/security checks.
- Follow-up slice: exact-head reruns and orderly integration of the relaunch PR
  stack.
