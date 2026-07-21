# SAV-279 — Trusted registry-only Validate

## Outcome

- User/business outcome: Exact stack-registry-only pull requests retain the
  protected `Validate` context without spending a complete hosted product,
  browser, Python, and database run on inert metadata.
- Success signal: A ready pull request that modifies only
  `.github/stacked-prs.json` receives an exact-head result from trusted
  default-branch code, while every broader change still runs ordinary
  `Validate`.
- Non-goals: Automated merge authority, branch-protection changes, provider
  state, Production changes, relaunch flags, or a custom recovery protocol.

## Context

- Why now: PR #368 changed only `.github/stacked-prs.json`; its otherwise
  successful full Validate job consumed 12m12s.
- Parent issue: SAV-238.
- Child issue: SAV-279.
- Related evidence: SAV-259, SAV-263, SAV-273, SAV-244, and PR #368.
- Current state: In Progress until the protected PR merges.

## Slice

- Primary slice: CI/DevOps cost control.
- Secondary slices: Trusted publisher integrity and engineering memory.
- Relevant skills: `meelni-linear-workstream`,
  `meelni-engineering-memory`, `meelni-codebase-architecture`, and
  `meelni-pr-prep`.
- Owner type: mixed. Agents maintain validation evidence; only the human owner
  decides whether to perform the native merge.

## Scope

- GitHub's `pull_request.paths-ignore` excludes only
  `.github/stacked-prs.json` from ordinary CI allocation.
- The trusted `pull_request_target` workflow checks out only default-branch
  code. After its topology step succeeds, the registry-only publisher may
  create the required exact-head `Validate` check.
- Eligibility requires exactly one `modified` registry file, canonical
  repository identities, a same-repository head, a `main` base, and fresh
  event/API PR, ref, head-SHA, and base-SHA agreement.
- The proposed manifest is inert data fetched through the exact
  commit/tree/blob graph. Only an unambiguous, non-truncated `100644 blob` with
  matching Pull Files/tree/blob SHAs, canonical bounded base64 bytes, a
  recomputed Git object SHA, and fatal UTF-8 decoding is accepted.
- The publisher opens a new exact-head pending check before the expensive
  proof, then validates manifest shape, the complete open stack inventory,
  every declared child/parent snapshot, ancestry, and PR-body evidence twice
  across a freshness barrier before completing that same check.
- Ready/closed events, draft branch/base movement, draft evidence-body edits,
  and trusted publisher/manifest push or manual fan-out sweep every open ready
  exact-registry candidate.
- The adjacent default-branch migration revalidation now republishes every
  open same-repository PR, including a neutral exact-head result for non-owners.
  This prevents a stale non-owner `Migration Collision / Verify` result from
  surviving a successful full sweep. The concrete live gap was PR #365: check
  run `88250709408` remained failed after successful full revalidation run
  `29718128633` because the sweep selected migration owners only. This is a
  check-evidence correction, not additional SAV-279 merge authority.

## Native protected merge boundary

The trusted result is validation evidence, not merge authorization. SAV-279
does not own a write-token workflow, merge endpoint call, recovery script,
auto-merge, or admin bypass. After reviewing the current PR target, exact head,
and all required checks, the human owner may use GitHub's native protected
pull-request merge. GitHub then evaluates the current PR and branch-protection
state at the native mutation boundary.

As verified read-only on July 19, 2026, the repository's merge queue is not
currently configured, auto-merge is disabled, and the CI workflow does not
support `merge_group`. Enabling a queue would require a separately reviewed
repository-policy and workflow change. Until then, the supported handoff is an
explicit owner action in GitHub's protected PR experience. No repository script
may turn an advisory snapshot into a merge.

This boundary is deliberate. GitHub's pull-request merge API can bind a head
SHA but has no expected-base-SHA parameter. A custom privileged workflow cannot
atomically bind the candidate, target branch, and mutable cross-PR dependency
evidence; post-merge checks can detect a bad mutation but cannot undo it.
Removing that mutation and recovery surface is safer than claiming impossible
transactional semantics. A future native merge queue is the platform path for
rebuilding and checking a queued candidate against the latest target branch.

## Fail-closed cases

No synthetic `Validate` success is created for forks, extra files, added,
removed, or renamed registries, stale head/base/repository snapshots, malformed
or oversized manifests, missing declarations, topology failures, pagination
ambiguity, API/transport failures, or movement during verification.

An extra app, workflow, or publisher-script path runs ordinary Validate. A
registry deletion can match the ignored path, but the publisher rejects its
`removed` status, leaving the required context absent and the PR blocked. A
newly invalid topology completes an opened pending check as failure. A failure
completing an already-created check leaves it pending and blocking.

There remains an unavoidable interval between a dependency change and creation
of a replacement check; an older success can remain visible if GitHub or the
runner fails first. The owner must therefore review live PR state and required
checks immediately before the native protected merge. The fast path makes no
atomic cross-PR merge claim.

## Acceptance criteria

- [x] Ordinary Validate is suppressed only for the exact registry path.
- [x] Trusted default-branch code classifies and validates the exact proposed
      manifest without executing PR code.
- [x] Exact-head pending/success/failure publication is fail-closed across
      pagination and freshness barriers.
- [x] The bespoke privileged merge workflow and recovery code are absent.
- [x] Tests fail closed if hosted automation gains repository-write token or
      inherited-secret authority. Runtime action and command fields reject
      externally supplied credential sources. Every checks/statuses-write job
      is structurally limited to a SHA-pinned default-branch checkout, pinned
      Node setup, and fixed trusted publisher commands. Lexical source scanning
      remains defense in depth rather than the authorization boundary.
- [x] Full migration sweeps replace stale non-owner results with neutral
      exact-head evidence.
- [x] Operations docs describe the native protected merge handoff and current
      merge-queue limitation without claiming atomic custom merge semantics.
- [ ] PR is independently reviewed and merged before SAV-279 closes.

## Validation

- Focused registry-only publisher, trigger, native-handoff contract, and stack
  adapter tests.
- Full `npm run test:local` and `npm run test:stack`.
- YAML parse, Prettier, ESLint, type checks, dependency boundaries, and Semgrep.
- Read-only inspection of repository merge settings, `main` protection, and
  rulesets; no GitHub mutation.
- `npm run verify:agent` when the complete local environment is available.

## Rollout and handoff

- Risk: Medium. The fast path can satisfy a required check, so default-branch
  provenance, exact scope, and freshness remain hard gates.
- Compatibility: Ordinary and manual Validate remain complete. All three live
  required contexts stay unchanged.
- Expected saving: roughly the 12m12s observed on PR #368 per future exact
  registry-only ready head, while retaining the smaller trusted sweep.
- Owner handoff: In GitHub, confirm the PR is open and ready, targets `main`, is
  the intended exact head, is current with `main`, and has successful
  `Validate`, `Trusted Publisher`, and `Migration Collision Publisher` checks;
  then use GitHub's native protected pull-request merge.
- Rollback: Through a protected PR, remove the one `paths-ignore` entry and the
  registry publisher step. Keep all required contexts unchanged.
- Follow-up: Consider a native merge queue only with separately reviewed
  `merge_group` validation, cost impact, repository rules, and rollout evidence.
