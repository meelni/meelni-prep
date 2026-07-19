# Hosted CI cost control

Meelni uses local validation continuously and one GitHub-hosted clean-machine
gate when a change becomes merge-ready.

## Trigger policy

- Feature-branch pushes do not run hosted Validate independently.
- Draft pull requests do not allocate a Validate runner or publish the required
  `Validate` context; they use a distinct lifecycle check name.
- Opening a non-draft pull request, marking a draft ready, or pushing a new
  commit to a ready pull request runs Validate for that exact head.
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

The trigger policy changes frequency without reducing merge-ready coverage.
Validate still installs a clean dependency graph, starts PostgreSQL, verifies
clean and upgrade migration paths, runs repository skills and Node/Python
contracts, executes the full quality/regression suite, and builds the production
application. Pull-request validation remains path-unfiltered. Manual dispatch
remains the break-glass clean-machine verification path, but never substitutes
for merge-ref validation.

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
4. Confirm exactly one current-head Validate run starts and passes.
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

Verify the live configuration before a merge window:

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
required and restore the `push: main` full-CI trigger. Never leave a skipped
lifecycle context named `Validate`.

Vercel, GitGuardian, and local results remain complementary evidence; none
replaces hosted Validate.

## Trusted publisher cost control

The stack and migration publishers use their two required contexts for
merge-ready PR events and closes that can invalidate dependent evidence. Draft
branch movement and base changes use one combined dependency audit; draft body
and title edits allocate no runner. There is no unattended schedule. Manual and
trusted-checker/default-branch full revalidation run topology and migration
publication in one hosted job. A `main` change to `.github/stacked-prs.json`
continues to trigger `Relaunch Integration Gates`, which checks out trusted
default-branch code and revalidates every open registered stack plus migration
ownership. Removing CI's general `main` push trigger does not change publisher
permissions, required contexts, or branch protection.

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
