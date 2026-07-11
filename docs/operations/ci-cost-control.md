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
- Pushes to `main` and manual `workflow_dispatch` runs retain the complete gate.
- Concurrency cancellation stops superseded runs for the same pull request/ref.

The trigger policy changes frequency, not coverage. Validate still installs a
clean dependency graph, starts PostgreSQL, verifies clean and upgrade migration
paths, runs repository skills and Node/Python contracts, executes the full
quality/regression suite, and builds the production application.

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

Vercel, GitGuardian, and local results remain complementary evidence; none
replaces hosted Validate.

## Budget operations

The repository owner should configure a monthly GitHub Actions budget suitable
for the relaunch cadence (initially $5–$10) and enable “stop usage when budget
limit is reached.” Budget mutation is an owner action. When a billing rejection
occurs, record it as infrastructure failure and do not label it a code failure.

Expected impact: removing duplicate feature-push runs cuts the common two-run
pattern roughly in half. Suppressing full runs during iterative draft work saves
additional minutes while retaining final independent proof.
