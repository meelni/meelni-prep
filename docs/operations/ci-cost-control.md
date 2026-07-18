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
- Pushes to `main` retain the complete gate unless the stack registry is the
  only changed path. Registry pull requests still run the complete gate before
  merge, while their trusted default-branch publisher performs the required
  post-merge topology and migration revalidation.
- Manual `workflow_dispatch` runs retain the complete gate.
- Concurrency cancellation stops superseded runs for the same pull request/ref.

The trigger policy changes frequency without reducing merge-ready coverage.
Validate still installs a clean dependency graph, starts PostgreSQL, verifies
clean and upgrade migration paths, runs repository skills and Node/Python
contracts, executes the full quality/regression suite, and builds the production
application. The exact `.github/stacked-prs.json` exclusion applies only to the
post-merge `main` push. A pull request changing that file remains unfiltered,
and any `main` push containing another path still runs the complete gate.

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
required and restore the previous trigger policy only long enough to prove the
replacement workflow. Never leave a skipped lifecycle context named `Validate`.

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
ownership. The CI path exclusion does not change publisher permissions,
required contexts, or branch protection.

## Budget operations

The Enterprise Cloud owner should enable included-usage alerts and configure a
small paid-overage budget with “stop usage when budget limit is reached.” The
larger enterprise allowance is not permission to restore unattended
high-frequency workflows. Budget mutation remains an owner action. When a
billing rejection occurs, record it as infrastructure failure and do not label
it a code failure.

Expected impact: removing duplicate feature-push runs cuts the common two-run
pattern roughly in half. Suppressing full runs during iterative draft work saves
additional minutes while retaining final independent proof. Registry-only
merges save one further full run, approximately nine minutes in the July 2026
observations, while retaining their merge-ready Validate and trusted post-merge
publication evidence.
