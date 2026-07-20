# SAV-279 — Trusted registry-only Validate

## Intent

- User request: Keep relaunch engineering moving without spending a complete
  hosted product-validation run on stack-registry metadata alone.
- Product/user outcome: Exact registry-only pull requests retain the protected
  `Validate` context through a risk-matched trusted verifier instead of the
  product, browser, Python, and database suite.
- Why now: PR #368 changed only `.github/stacked-prs.json`; its otherwise
  successful full Validate job consumed 12m12s.

## Slice

- Primary slice: CI/DevOps cost control.
- Secondary slices: Trusted publisher integrity and engineering memory.
- Relevant skills: `meelni-linear-workstream`,
  `meelni-engineering-memory`, `meelni-codebase-architecture`, and
  `meelni-pr-prep`.

## Linear tracking

- Project: Meelni.
- Parent: SAV-238.
- Child: SAV-279.
- Related evidence: SAV-259, SAV-263, SAV-273, SAV-244, and PR #368.
- Current state: In Progress until the protected PR merges.

## Scope

- GitHub's `pull_request.paths-ignore` excludes only
  `.github/stacked-prs.json` from ordinary CI allocation.
- The existing trusted `pull_request_target` job checks out only default-branch
  code. After its normal topology step succeeds, the registry-only publisher
  may create the required exact-head `Validate` check.
- Eligibility requires exactly one `modified` registry file plus matching
  repository IDs/names, same-repository head, default-branch base, and fresh
  event/API head and base SHAs.
- The proposed manifest is fetched as data at the immutable head SHA. No
  pull-request file is checked out or executed.
- For each eligible ready candidate, the publisher first creates a new
  exact-head `Validate` check in progress so an older success cannot authorize
  a merge during revalidation. It validates manifest shape, the complete open
  stacked-PR inventory, every declared child/parent snapshot, ancestry, and
  PR-body evidence twice across a freshness barrier before completing that same
  check.

General metadata path optimization, branch-protection changes, provider state,
Production, relaunch flags, and merge authorization are out of scope.

## Fail-closed cases

No synthetic `Validate` success is created for forks, extra files, added,
removed, or renamed registries, stale head/base/repository snapshots, malformed
or oversized manifests, missing stack declarations, topology failures,
pagination ambiguity, API/transport failures, or movement during verification.

An extra app, workflow, or publisher-script path makes GitHub run ordinary
Validate. A registry deletion can match the ignored path, but the trusted
publisher rejects its `removed` status, leaving the required `Validate` context
absent and the PR blocked.

The trusted workflow sweeps every open ready exact-registry candidate after
ready PR and close events, draft branch/base movement, draft stack-evidence body
edits, and trusted publisher/manifest push or manual fan-out. Drafts, forks,
non-default bases, malformed rows, and ordinary PRs are excluded before
candidate classification. A newly invalid topology completes the pending check
as failure; a completion infrastructure failure leaves it pending and blocking.

## Validation

- Focused registry-only publisher, trigger, and stack-adapter tests.
- Full `npm run test:local` and `npm run test:stack`.
- YAML parse and Prettier for both workflows, scripts, tests, and docs.
- `npm run verify:agent` when the complete local environment is available.
- Read-only inspection of live branch protection; no protection mutation.

## Rollout

- Risk: Medium. The fast path can satisfy a required check, so default-branch
  provenance, exact scope, and freshness are hard gates.
- Backward compatibility: Ordinary and manual Validate remain complete.
- Expected saving: roughly the 12m12s observed on PR #368 per future exact
  registry-only ready head, while retaining the smaller trusted sweep.
- Rollback: Through a protected PR, remove the one `paths-ignore` entry and the
  registry publisher step. Keep all three required contexts unchanged.
