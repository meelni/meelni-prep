# Hosted CI cost control

Meelni uses local validation continuously and one GitHub-hosted clean-machine
gate when a change becomes merge-ready. The gate is one protected result backed
by parallel validation lanes rather than one serial runner.

## Trigger policy

- Feature-branch pushes do not run hosted Validate independently.
- Draft pull requests do not allocate a Validate runner or publish the required
  `Validate` context; they use a distinct lifecycle check name.
- Opening a non-draft pull request, marking a draft ready, or pushing a new
  commit to a ready pull request runs Validate for that exact head, except for
  the exact registry-only fast path below.
- Converting a ready pull request back to draft cancels superseded work without
  allocating a new Validate runner.
- Closing a pull request also cancels any queued or running Validate work without
  publishing the required context.
- Protected merges to `main` do not allocate a second full Validate runner.
  Strict branch protection requires every merge-ready pull request to be current
  with `main`, and the pull-request workflow validates GitHub's generated merge
  ref. The resulting protected merge therefore has the same Git tree that the
  required PR check already validated.
- Trusted stack and migration publishers retain their own scoped `main` triggers
  and post-merge revalidation. Removing the full CI push trigger does not remove
  those operational checks.
- Manual `workflow_dispatch` runs retain the complete gate under the distinct
  `Manual Validate` context, so they cannot satisfy the protected PR-only
  `Validate` requirement.
- Concurrency cancellation stops superseded runs for the same pull request/ref.

The trigger policy changes frequency while preserving risk-matched merge-ready
coverage. Full Validate installs clean dependency graphs, verifies clean and
upgrade migration paths, runs repository skills and Node/Python contracts,
executes the full quality/regression suite, and builds the production
application. Pull-request path suppression has one exact exception:
`.github/stacked-prs.json`. Manual dispatch remains the break-glass
clean-machine verification path, but never substitutes for merge-ref
validation.

## Parallel validation topology

Full-coverage merge-ready heads run the complete gate in four independent
GitHub-hosted lanes:

- `Static and Python Contracts` runs repository-skill validation, formatting,
  linting, both TypeScript passes, dependency/boundary/security quality checks,
  and the Python agent contracts.
- `Unit and Contract Tests` runs local tooling tests and the full Node/Vitest
  regression suite.
- `Database Migrations` is the only lane that starts PostgreSQL and verifies
  clean and legacy upgrade paths.
- `Production and Browser QA` builds the isolated production artifact, crawls
  public routes, and runs the representative Chromium matrix. CI uses two
  Chromium workers across isolated project/file groups while preserving zero
  retries and ordered execution within each file.

The lanes have no dependencies on each other after classification. A final
GitHub Actions job uses `always()` and publishes the exact required `Validate`
context only after inspecting classification and every lane result. A selected
lane must succeed and an unselected lane must be skipped; failure, cancellation,
missing output, or any other combination fails the aggregator. Manual dispatch
selects every full lane and publishes `Manual Validate`, never the protected PR
context. Draft and closed events allocate no validation lanes and cannot publish
a successful `Validate`.

Parallelization deliberately trades a modest increase in aggregate runner
minutes for a lower merge critical path. PR #484 provided the first live
full-path result: 6m34s end to end, with a 6m22s production/browser critical
lane, down from the 15m37s p90 measured across the 20 preceding successful runs
on July 26, 2026. The ongoing service-level target is a full ready-PR p90 of
seven minutes or less.

## Conservative change routing

`scripts/classify-ci-changes.mjs` classifies GitHub's checked-out pull-request
merge relative to its first parent. It uses only repository paths and status,
never PR labels, titles, body text, user inputs, API guesses, or transitive test
inference.

| Change class                                             | Repository docs | Static/Python | Unit/contracts | PostgreSQL | Production/browser |
| -------------------------------------------------------- | --------------: | ------------: | -------------: | ---------: | -----------------: |
| Documentation only                                       |             yes |            no |             no |         no |                 no |
| Python `agent/` only                                     |              no |           yes |            yes |         no |                 no |
| SQL/JSON migration only                                  |              no |           yes |            yes |        yes |                 no |
| App, UI, public content, or browser QA                   |              no |           yes |            yes |         no |                yes |
| Mixed owned classes                                      |              no |           yes |            yes |      union |              union |
| Config, dependency, workflow, shared library, or unknown |              no |           yes |            yes |        yes |                yes |
| Manual dispatch                                          |              no |           yes |            yes |        yes |                yes |

Documentation means top-level `README.md`, `AGENTS.md`, or `DESIGN.md`, or
reviewed documentation/assets below `docs/`, `openspec/`, and `.agents/`.
Product content below `content/` is application behavior and retains production
and browser validation. The lightweight documentation lane installs the locked
dependency graph, runs Prettier on changed text documents, and validates all
repository skills.

Only added and modified paths can use targeted routing. Deleted, renamed,
copied, empty, malformed, or unreadable diffs select full coverage. Changes to
the workflow, classifier, tests, package lock, configs, shared `lib/` or
`packages/` code, and every unowned path also select full coverage. The
classifier regression test inventories every tracked top-level entry so a new
root cannot silently acquire a fast path.

The first routing PR necessarily selects the full gate because it changes CI
and classifier code. A separate documentation-only proof PR must demonstrate
the two-minute SLO before this rollout is considered complete.

### July 26, 2026 rollout evidence

The rollout uses exact hosted runs rather than local estimates:

- Before parallelization, the 20 preceding successful full runs had a 15m21s
  median and a 15m37s p90. Documentation-only PR #479 took 15m49s, and a
  three-line backend fix in PR #480 took 15m27s.
- Parallelization PR #484 first proved the complete gate at 6m34s end to end.
- Routing PR #486 proved the current rebased full path at exact head
  `44abae5721f9ef92c3846761a9eb85137c45a096` in
  [run 30223964289](https://github.com/meelni/meelni-prep/actions/runs/30223964289):
  6m12s end to end, with a 5m52s production/browser critical lane, 5m35s
  unit/contracts lane, 3m28s static/Python lane, 2m21s database lane, and a
  successful three-second `Validate` aggregator.

SAV-334 records the separate documentation-only run and final protection
readback before closing the rollout. A documentation proof is valid only when
the repository lane succeeds, every code lane is skipped, the exact required
`Validate`, `Trusted Publisher`, and `Migration Collision Publisher` contexts
succeed, and the pull request merges through normal strict protection.

### Exact registry-only fast path

GitHub, not pull-request code, applies the one-entry `paths-ignore`. A proposed
change to any app, workflow, verifier, publisher, or other path therefore still
starts ordinary Validate. The PR cannot edit a classifier to suppress its own
full gate.

For the ignored exact-registry case, default-branch `pull_request_target` code
is the sole authority allowed to create the required `Validate` success. It
requires exactly one `modified` `.github/stacked-prs.json` file; matching
repository IDs and names; a same-repository head and default-branch base; and
fresh event/API PR number, ref, head SHA, and base SHA. It fetches the proposed
manifest as inert data by traversing the exact head commit and non-truncated Git
trees. The registry must be one unambiguous `100644 blob`; symlinks, gitlinks,
executables, missing entries, and mismatched Pull Files/tree/blob SHAs fail.
The blob response must have canonical base64, the exact declared and decoded
size within the 256 KiB bound, its recomputed Git object SHA, and fatal UTF-8
decoding. The publisher never checks out or executes PR code. It verifies
manifest shape, the complete open stacked-PR
inventory, every declared child/parent snapshot and ancestry, and current
PR-body evidence twice across a freshness barrier. After exact eligibility and
before that work begins, it creates a new exact-head `Validate` check in
progress. It completes that same check success or failure and binds success to
a SHA-256 generation of the exact repository/head/base/topology proof. A
failure while completing an already-created check leaves that new check pending
and blocking.

Forks, extra files, additions, deletions, renames, stale snapshots, malformed
manifests, missing declarations, topology failures, incomplete pagination, API
errors, and concurrent movement receive no synthetic success. Extra paths run
ordinary Validate. An exact registry deletion can be suppressed by GitHub's
path filter, but its `removed` status is ineligible, so the required check stays
absent and protection blocks the PR.

The trusted publisher sweeps all open ready exact-registry candidates on ready
PR and close events, draft branch/base movement, draft stack-evidence body
edits, and trusted publisher/manifest push or manual fan-out. Drafts, forks,
non-default bases, malformed list rows, and ordinary PRs are rejected before
candidate classification. This refreshes or invalidates prior registry
`Validate` snapshots when a declared child or parent moves, closes, or changes
evidence. Unrelated `main` changes do not run this publisher; strict up-to-date
protection forces the registry branch to update before merge, and that new head
receives the pull-request sweep.

There is an unavoidable cross-PR interval between a dependency event and the
publisher opening a replacement check. A GitHub API or runner failure before
that pending check is created cannot erase an older green check. Do not treat a
visible green registry-only `Validate` result by itself as merge authority.

### Registry-only native protected merge handoff

The trusted result is validation evidence, not merge authorization. SAV-279 has
no write-token merge workflow, repository-owned merge command, recovery probe,
auto-merge, or admin bypass. After reviewing the current PR target, exact head,
and all required checks, the human owner may use GitHub's native protected
pull-request merge. GitHub evaluates the current PR and branch-protection state
at that native mutation boundary.

As verified read-only on July 19, 2026, the repository's merge queue is not
currently configured, auto-merge is disabled, and the CI workflow does not
support `merge_group`. A queue therefore cannot be enabled safely by this
source-only cost-control change. Adding one requires a separately reviewed
repository-policy change, a `merge_group` validation design, and explicit cost
evidence.

The owner handoff is:

1. Open the pull request in GitHub and confirm it is still open and ready.
2. Confirm the base is `main` and the displayed head is the intended candidate.
3. Confirm GitHub says the branch is current with `main`.
4. Require successful `Validate`, `Trusted Publisher`, and
   `Migration Collision Publisher` checks for that head.
5. Use GitHub's native protected pull-request merge. Do not run a local or
   repository-scripted merge and do not infer authority from an earlier
   advisory snapshot.

GitHub's pull-request merge API accepts an expected head SHA but no expected
base SHA. A custom privileged workflow cannot make the candidate, target branch,
and mutable cross-PR dependency evidence one transaction. Post-merge checks can
detect a wrong-base mutation but cannot undo it. Removing the bespoke mutation
and recovery attack surface is safer than presenting repeated reads as atomic.
The native protected experience owns current branch-protection enforcement; a
future native merge queue is the platform mechanism for rebuilding and checking
a queued candidate against the latest target branch.

This policy depends on live protection, not convention. As verified on July 19,
2026, required status checks use strict up-to-date enforcement, protection
applies to admins, and force pushes are disabled. PR #353's validated merge ref
`b6474d1c` and resulting `main` merge `c7cf038f` had the exact same tree
`1ab7e873bc5013b9c7d789a6d7651340518e063e`; the second 9m48s full run therefore
retested identical content. If strict protection, admin enforcement, or merge
policy changes, restore the `push: main` trigger before relying on this policy.

## Agent workflow

1. Keep implementation and audit-remediation pull requests in Draft.
2. Run `npm run check:ci`, relevant provider/database harnesses, and
   `npm run build` locally before requesting final hosted evidence.
3. After independent review is clean, mark the pull request Ready for review.
4. For an exact registry-only PR, confirm the trusted publisher created the
   exact-head result and follow the native protected merge handoff above. For
   every other PR, confirm ordinary Validate ran.
5. If the head changes, require a new exact-head green run before merge.

Repository rules must require the exact `Validate` context on `main`. A skipped
lifecycle check is not a substitute. Verify branch protection or a ruleset is
active before treating the workflow as an enforced merge gate.

## Main protection

The live `main` branch protection requires the GitHub Actions `Validate`,
`Trusted Publisher`, and `Migration Collision Publisher` contexts with strict,
up-to-date head enforcement. Protection applies to admins, blocks force pushes,
and blocks branch deletion. It does not currently require an approving review;
independent agent audit evidence is tracked in the PR and Linear workflow
instead. This is classic branch protection; no general repository ruleset is
currently configured.

Verify the live configuration before an operator merge:

```bash
gh api repos/meelni/meelni-prep/branches/main/protection \
  --jq '{required_status_checks,enforce_admins,allow_force_pushes,allow_deletions}'
```

Expected invariants:

- `required_status_checks.strict` is `true`.
- The required checks are `Validate`, `Trusted Publisher`, and
  `Migration Collision Publisher` from GitHub Actions.
- Admin enforcement is enabled.
- Force pushes and deletion are disabled.

### Break glass and rollback

Do not disable protection to merge a failing product change. For a GitHub
Actions outage, record the incident and exact blocked head in Linear, obtain an
explicit owner decision, and time-box any protection change. Restore the full
configuration immediately after the emergency action and verify it through the
API above.

To roll back change routing without undoing parallelization, change the
classifier to select all four full lanes for every diff and remove the
lightweight repository lane in a protected PR. To roll back the cost-control
workflow itself, revert its commit through a PR; keep `Validate`, `Trusted
Publisher`, and `Migration Collision Publisher` required and restore the
`push: main` full-CI trigger. To roll back only the registry fast path, remove
its exact `paths-ignore` and publisher step through a protected PR. Never leave
a skipped lifecycle context named `Validate`.

Vercel, GitGuardian, and local results remain complementary evidence; none
replaces hosted Validate.

## Trusted publisher cost control

The stack and migration publishers use their two required contexts for
merge-ready PR events and closes that can invalidate dependent evidence. Draft
branch movement and base changes use one combined dependency audit. Draft title
edits allocate no runner; draft body edits run only the bounded registry
snapshot refresh because stack evidence can invalidate an open registry PR.
There is no unattended schedule. Manual and
trusted-checker/default-branch full revalidation run topology and migration
publication in one hosted job. A `main` change to `.github/stacked-prs.json`
continues to trigger `Relaunch Integration Gates`, which checks out trusted
default-branch code and revalidates every open registered stack plus migration
ownership. Removing CI's general `main` push trigger does not change publisher
permissions, required contexts, or branch protection.

On qualifying pull-request, close, trusted push, and manual events, that same
trusted checkout sweeps the exact registry-only fast path after normal topology
revalidation. Only this default-branch publisher may replace the full PR run
with a `Validate` success; ordinary stack and migration publishers retain their
separate required names.

## Budget operations

The Enterprise Cloud owner should enable included-usage alerts and configure a
small paid-overage budget with “stop usage when budget limit is reached.” The
larger enterprise allowance is not permission to restore unattended
high-frequency workflows. Budget mutation remains an owner action. When a
billing rejection occurs, record it as infrastructure failure and do not label
it a code failure.

Expected impact: removing duplicate feature-push runs cuts the common two-run
pattern roughly in half. Suppressing full runs during iterative draft work saves
additional minutes while retaining final independent proof. Removing the
post-merge duplicate saves one further full run for every protected merge—9m48s
for PR #353—while retaining merge-ref Validate, strict protection, manual
dispatch, and trusted stack/migration publication.

The exact registry-only path saves the full 12m12s observed on PR #368 for each
future eligible ready head. The smaller trusted publisher still runs because
registry changes alter CI trust metadata and must be checked against live stack
state.
