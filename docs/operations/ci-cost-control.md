# Hosted CI cost control

Meelni uses local validation continuously and one GitHub-hosted clean-machine
gate when a change becomes merge-ready.

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
coverage. Ordinary Validate still installs a clean dependency graph, starts PostgreSQL, verifies
clean and upgrade migration paths, runs repository skills and Node/Python
contracts, executes the full quality/regression suite, and builds the production
application. Pull-request path suppression has one exact exception:
`.github/stacked-prs.json`. Manual dispatch remains the break-glass
clean-machine verification path, but never substitutes for merge-ref
validation.

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

### Registry-only protected merge

Read-only mode is useful for diagnosis from a clean, trusted default-branch
checkout, but it deliberately returns `status: advisory` and
`mergeAuthorized: false`:

```bash
GITHUB_TOKEN="$(gh auth token)" \
GITHUB_REPOSITORY=meelni/meelni-prep \
npm run preflight:registry-merge -- --pr <number>
```

Do not merge from that advisory result. The required operator path explicitly
owns the merge:

```bash
GITHUB_TOKEN="$(gh auth token)" \
GITHUB_REPOSITORY=meelni/meelni-prep \
npm run preflight:registry-merge -- --pr <number> --merge
```

The command recomputes the exact-head Git-object and live topology proof,
requires the proof-bound `Validate` success to be less than ten minutes old,
and checks that the globally serialized trusted publisher workflow queue is
fully drained and its newest run succeeded. It verifies strict required checks,
admin enforcement, disabled force-push/deletion, a clean mergeable PR, and
disabled auto-merge. All three required contexts are read as exact-head
successful Check Runs from their configured GitHub App; only `Validate` carries
the independently recomputed proof-generation binding.

Merge mode repeats the PR proof and publisher-queue inventory, then performs a
third final live read of PR state/head/base, auto-merge and mergeability, exact
Git objects and topology, branch protection, required check inventory and apps,
proof-bound `Validate` freshness, and the drained stable publisher queue. It
rechecks expiry immediately before sending `PUT /pulls/<number>/merge` with the
exact expected head SHA and normal `merge` semantics. An invalid merge response
fails the command. No auto-merge or admin bypass is used.

GitHub cannot make multiple mutable PR refs plus the final merge one
transaction. Owning the merge in the same command removes the unsafe manual
window, minimizes the remaining API interval after the final serialized
barrier, and makes candidate-head movement fail through the expected SHA. Any
activity, provider incident, API uncertainty, or command failure requires a
fresh run; never finish the merge manually from prior advisory output.

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
4. For an exact registry-only PR, run the mandatory explicit `--merge` command
   above; inspect its proof generation, publisher run, exact head, and returned
   merge commit. Read-only advisory mode is not merge authorization. For every
   other PR, confirm ordinary Validate ran.
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

To roll back the cost-control workflow itself, revert its commit through a PR;
keep `Validate`, `Trusted Publisher`, and `Migration Collision Publisher`
required and restore the `push: main` full-CI trigger. To roll back only the
registry fast path, remove its exact `paths-ignore` and publisher step through a
protected PR. Never leave a skipped lifecycle context named `Validate`.

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
