# Tooling

## Local Setup

Meelni local and calibration tooling requires the exact Node version recorded
in `.node-version` (`22.22.0`). Select it before setup:

```bash
fnm install 22.22.0
fnm use 22.22.0
```

`package.json` declares the supported deployment/runtime major as `22.x` so
Vercel stays on Node 22 while receiving supported patch updates. Local setup,
doctor, calibration bundle construction, and calibration verification are more
strict: they require the exact reviewed `22.22.0` runtime. Setup checks this
before dependency installation, env refresh, provider access, or Python setup.

Run:

```bash
npm run setup:local
```

This installs Node dependencies, creates `.context/npm-cache`, ensures `.env.local` exists from `.env.example` when possible, creates the Python virtual environment under `agent/venv`, and installs agent dependencies. The Python venv is created with copied binaries instead of symlinked binaries so local Next.js/Turbopack builds do not walk into invalid absolute interpreter symlinks.

When `.env.local` is missing required runtime values or still contains placeholders from `.env.example`, setup attempts to self-heal by using the authenticated Vercel CLI:

```bash
npx vercel@55.0.0 link --yes --project meelni
npm run env:pull
```

If the Vercel CLI is not logged in, setup keeps going but prints the recovery command. Set `MEELNI_SKIP_ENV_PULL=1` only when you intentionally want to keep the current local env file unchanged.

If an older `agent/venv` uses symlinked Python binaries, setup recreates it with copied binaries. The venv is generated and gitignored, so this is safe and keeps `npm run build` compatible with a normal local setup.

### Environment refresh safety

`npm run env:pull` and `npm run env:pull:preview` pull only Vercel Preview into
`.env.local`. `npm run env:pull:production` pulls only Vercel Production into
`.env.production.local`. The command rejects swapped filenames, symlinked
targets, concurrent refreshes, and Supabase database/public project mismatches.
It pulls into a private temporary file, validates the result, and atomically
replaces the destination with mode `0600`; a failed pull leaves the existing
file unchanged.

Both Vercel environments must define the same non-secret
`MEELNI_PRODUCTION_SUPABASE_PROJECT_REF`. Preview refreshes fail if their
aligned Supabase project equals that declared Production ref; Production
refreshes fail unless their aligned project matches it exactly. Missing,
malformed, or ambiguous identity metadata fails before the destination file is
replaced.

Vercel can return a present but blank value for an encrypted secret. In that
case the refresh preserves a usable value already present in the same
environment file only when that file is already marked for the requested
environment. Public Supabase URL and anon-key values always come from the
current scoped pull and are never restored from an older file. The refresh
also requires the Supabase, LiveKit, and OpenAI values needed by local runtime;
Production must supply its own application URL. It never borrows database,
Supabase, Stripe, or provider credentials from Development or Production, and
a key absent from Vercel is treated as removed rather than silently
resurrected.

For a fresh unmarked file, a restored database connection is adopted only when
its Supabase project matches the public project returned by the current scoped
Vercel pull. This provides a safe first-run recovery path without allowing a
Production database to seed Preview. Production additionally rejects
non-HTTPS/loopback application URLs and Stripe test-mode keys.

That database match authorizes only the database and a separately verifiable
Supabase service-role token. It never authorizes unrelated provider values. If
you intentionally restored multiple values from the matching Preview provider
dashboards into a fresh unmarked file, review their environment/mode and run
the explicit one-time adoption command:

```bash
npm run env:adopt:preview
```

Production adoption is a separate explicit command and should be used only
after checking live Stripe mode, provider accounts, and the public app URL:

```bash
npm run env:adopt:production
```

Both commands still require the restored database project to match the current
scoped Vercel public Supabase project before any unrelated value is accepted.

The Vercel CLI version used by the refresh is pinned in the script. A live lock
prevents concurrent refreshes, and a lock owned by a dead process is recovered
automatically. If a malformed lock file remains after an interrupted manual
edit, remove only `.env.local.lock` or `.env.production.local.lock` after
confirming no refresh process is running.

If `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, or another server-only secret is
missing locally, restore the value directly from the matching provider
dashboard into the gitignored environment file, or rotate it and update the
same Vercel environment. Never paste the value into chat, Linear, documentation,
or a tracked file. Then rerun the scoped pull and the read-only check:

```bash
npm run env:pull:preview
npm run db:preflight:preview
```

For Production, keep the relaunch gate paused and select the Production file
explicitly:

```bash
npm run env:pull:production
npm run db:preflight:production
```

Remote migrations use the matching scoped alias plus a separate explicit
confirmation. The alias selects the env file but intentionally does not supply
the confirmation itself:

```bash
MEELNI_ALLOW_REMOTE_MIGRATION=1 npm run db:migrate:preview
MEELNI_ALLOW_REMOTE_MIGRATION=1 npm run db:migrate:production
```

The migration and preflight wrappers apply the same project identity rule as
the pull. A Preview target can never equal the declared Production project,
and a Production target must equal it. Loopback PostgreSQL URLs do not require
shared-environment markers or a Production ref.

## Doctor

Run:

```bash
npm run doctor
```

The doctor checks the exact Node version, npm, dependencies, local env files,
Python availability, Python agent environment, and Conductor configuration. A
Node mismatch is a failure and prints the deterministic `fnm install`/`fnm use`
recovery command while allowing the rest of the diagnostic report to finish.

The doctor fails when required local runtime envs are missing or contain placeholder values such as `https://xxx.supabase.co`, `wss://your-project.livekit.cloud`, or `sk-proj-xxx`. This is intentional: provider placeholders can otherwise look valid until login, LiveKit, or feedback generation fails at runtime.

## Development

Run all local runtime processes:

```bash
npm run dev:local
```

This is the normal coding-agent run target. It starts the Next.js dev server, starts the Inngest Dev Server against `/api/inngest`, and attempts to start the Python LiveKit agent if `agent/venv` exists. If dependencies are missing, it runs `npm run setup:local` first.

Agent platforms that honor `conductor.json` should use:

- setup: `npm run setup:local`
- run: `npm run dev:local`

Codex local environments should use `.codex/environments/environment.toml`. Its setup action runs `npm run setup:local` followed by `npm run doctor`, so fresh worktrees fail early when Vercel auth/env refresh is unavailable.

Run individual services only when debugging:

```bash
npm run dev
npm run dev:inngest
npm run dev:agent
```

Useful local overrides:

```bash
CONDUCTOR_PORT=3001 npm run dev:local
INNGEST_PORT=9100 npm run dev:local
MEELNI_SKIP_INNGEST=1 npm run dev:local
MEELNI_SKIP_AGENT=1 npm run dev:local
```

When `CONDUCTOR_PORT` or `PORT` changes the web port, `dev:local` derives non-overlapping Inngest ports so adjacent worktrees can run side by side. The default web port `3000` uses Inngest UI port `8288`; web port `3001` uses `8298`; web port `3002` uses `8308`.

## Local Credit Bypass

`NODE_ENV=development` bypasses the interview credit ledger on local runs, even when `.env.local` includes Vercel metadata from `npm run env:pull`. `/api/billing/credits` returns a non-persistent dev balance, and `/api/session/start` reserves and consumes credits in memory.

Set `MEELNI_DISABLE_LOCAL_CREDIT_BYPASS=1` in `.env.local` to test the real credit ledger locally.

## Relaunch Gate Fallback

The relaunch gate is resolved on the server with disabled event logging. Public
surfaces use a non-identifying operational Statsig user; authenticated interview
start and reconnect-token issuance use the signed-in Statsig user. Disabled
access is rejected before any session/credit mutation or participant-token
issuance. `MEELNI_REACTIVATION_DEFAULT` is the explicit provider-outage
fallback: keep it `false` before relaunch and change it to `true` only as part of
the separately authorized launch flip after the product owner's explicit GO.
Passing technical gates alone does not authorize that change. Rollback changes
the Statsig gate and this fallback together so a Statsig outage cannot invert
the intended product state.

The controlled `relaunch-default-on` workflow remains unsupported until its
dedicated Statsig/Vercel provider adapter exists; the repository exposes no
executable default-on command. Do not change the Statsig global gate or
`MEELNI_REACTIVATION_DEFAULT` to true directly. Unlike other Production action
artifacts, default-on must contain the owner's explicit `GO` bound to the exact
candidate. Default-off and emergency disable remain available without GO.

Statsig provider governance for the gate is tracked separately in
[Statsig Relaunch Governance](./statsig-relaunch-governance.md). SAV-283 may
prepare the review-settings mutation and evidence packet, but the provider
mutation itself requires explicit owner approval and must not enable the gate or
change targeting rules.

The ordered prelaunch execution checklist is tracked in
[Relaunch Readiness Execution](./relaunch-readiness-execution.md). Use it to
sequence the `SAV-198` calibration guardrails, `SAV-126` Stripe/Vercel catalog
setup, `SAV-283` Statsig governance evidence, and `SAV-186` Preview golden path
without treating any technical gate as launch GO.

In local development, the feature-flag menu stores an on/off cookie and reloads the page so the server-rendered body, metadata, and client controls use the same state.

## Local Inngest Feedback

Run the Inngest dev server while testing post-interview feedback:

```bash
npx inngest-cli@latest dev
```

The app explicitly uses Inngest dev mode outside `NODE_ENV=production`, so copied Vercel metadata in `.env.local` does not require `INNGEST_EVENT_KEY` for local event sends. Feedback evaluation still requires a nonblank `OPENAI_API_KEY` in `.env.local`.

## Evaluation Calibration

The PM feedback gold-set preflight and deterministic harness are local and
provider-free:

```bash
npm run calibration:preflight
npm run calibration:self-test
```

They intentionally leave calibration-evidence acceptance pending. The paid
live-provider mode requires a separate exact acknowledgement and is documented
in the [Evaluation Calibration Runbook](./evaluation-calibration.md).

## Validation

Use targeted validation while the monorepo migration is in progress:

```bash
npm run test:local
npm run typecheck
npm run lint
```

Before opening or merging agent-authored changes, run the standard agent verification suite:

```bash
npm run verify:agent
```

This runs the local doctor, canonical skill validation, TypeScript, local
package tests, Python runtime-contract tests, lint, and the production build.
The Python contract suite is mandatory even when `agent/venv` is absent because
it uses provider-neutral fakes. LiveKit Agents and its plugins are pinned as one
tested version family in `agent/requirements.txt`; update them together and
rerun TypeScript/Python golden contract fixtures before deployment.

## Relaunch Pull Request Verification

Immutable stack identities live in the trusted default-branch copy of
`.github/stacked-prs.json`: repository, child PR/head ref, and parent PR/head
ref. Current commit SHAs are resolved dynamically and are never registry
state. The read-only
`pull_request_target` workflow checks out only default-branch code, binds a
declaration to the exact PR number and source repository, and fetches the
server-owned PR head plus its declared parent. It never executes proposed PR
code. The deterministic core remains offline and verifies that the child
contains the current parent and that PR-body evidence names the exact child
head, parent head, and merge-base.

The workflow publishes a custom `Stack Topology / Verify` Check Run on the
verified PR head for exact audit evidence. Classic protection requires the
stable GitHub Actions `Trusted Publisher` job because the repository did not
reliably enforce REST-created checks. Every
same-repository PR event also fans out to its open registered children. The
globally serialized, maximum-depth pending queue retains parent movement and
closure events. The publisher refreshes exact child and parent refs just before
success; a deleted parent ref fails the child closed. Draft branch/base movement
uses one combined dependency audit, while draft body/title edits wait until the
PR becomes ready. Filtered trusted-checker or manifest pushes to `main` and
manual dispatch provide full backstops for default-branch movement and operator
recovery. Parent-triggered child topology failures fail the child's custom check
without failing the parent's stable required context. A triggering registered
child's own topology failure, or any API/publication failure, fails the stable
context.

Unregistered PRs targeting `main` publish an explicit successful custom check
whose output says the PR is not a registered stack child. The required
`Trusted Publisher` job succeeds after safe publication. Registered children
and undeclared non-default stacks retain the exact fail-closed behavior
described in the runbook.

The same trusted workflow inventories every open same-repository PR and all of
its paginated file diffs. Every non-removed change to a direct
`lib/db/migrations/<numeric>_*.sql` file claims that numeric sequence. Removed
or renamed-away migration history fails as an immutable-history violation. The
workflow publishes a separate exact-head `Migration Collision / Verify` Check
Run: unique owners pass, every owner of a duplicate sequence fails, and the
triggering PR receives a neutral result when it changes no Drizzle migration.
Fork PRs do not enter the repository migration inventory.
Fork events also skip the migration fan-out so untrusted contributors cannot
consume the same-repository audit budget.

Classic protection requires `Migration Collision Publisher`, the stable Actions
job context. The job fails for any global inventory, publication, or freshness
error, or when the triggering open PR owns a collision/violation. It succeeds
for an unrelated trigger even while custom failure checks are published to
other collision owners. Closed triggers do not inherit peer failures. Forks
cannot enter the same-repository inventory and fail the required job closed;
private-repository changes must be moved to a maintainer-owned branch. The
custom Check Run remains the detailed exact-head audit record and is not the
enforceable classic-protection context.

The inventory fails closed. A malformed response, incomplete PR/file page,
moving PR head, GitHub API error, or Check Run error prevents the workflow from
claiming that collision absence was proved. When the open PR list is known, an
incomplete file inventory publishes failure to every known open
same-repository PR during a full sweep. Event-scoped runs publish failure to
every known migration or immutable-history owner, every PR whose diff failed,
and the triggering PR. Any missing diff could collide with a known migration
owner. On a PR event where the list itself fails, the triggering exact head
receives failure. The combined full-revalidation job also fails so an operator
cannot mistake missing checks for a clean inventory.

GitHub caps the pull-request files API at 3,000 files. Reaching that ceiling is
treated as incomplete rather than assuming the unseen tail has no migration.

Non-draft opened, reopened, synchronized, relevant edited, closed, and
ready-for-review events refresh affected owners immediately. Draft branch/base
movement uses one combined audit; draft body/title edits allocate no runner.
Filtered trusted-checker or manifest pushes to `main` and manual dispatch are the
recovery paths for default-branch movement or an intentionally requested full
sweep. Full sweeps publish every open same-repository PR so a current neutral
result replaces stale non-owner evidence. They reuse the latest completed Check
Run when its exact head, GitHub Actions app identity, conclusion, and summary
are unchanged.

Event-driven, filtered default-branch, and manual migration publishers share the
global
`migration-collision-audit` concurrency group with running-run cancellation
disabled. An older inventory therefore cannot finish after a newer audit and
overwrite its collision failure with stale success. Immediately before each
publication phase, the publisher re-lists the complete same-repository PR set
and verifies the recorded inventory generation, head, head ref, repository, and
base ref. Freshness is checked before lookup, after lookup before reuse/create,
and after Check Run creation immediately before completion. Check summaries
include the SHA-256 inventory generation, so reuse cannot cross snapshots. If
publication is deferred across a PR-set or head change, or any freshness read
fails, the run creates or patches failure rather than reusing or completing
success from the stale result.

Run the offline regression fixtures with:

```bash
npm run test:stack
```

The reconvergence, migration serialization, and manual audit procedures are documented in
[Stacked Pull Requests](./stacked-pull-requests.md).

## Database Migration Verification

The Drizzle migration chain must support both an empty database and the
pre-relaunch Supabase schema that was partially created outside the journal.
CI starts a pinned PostgreSQL 17 service and runs:

```bash
npm run test:database-migrations
```

The test refuses remote hosts and requires a maintenance database name ending
in `_test`. It creates fresh clean and legacy-upgrade databases, exercises the
guarded CLI path, and verifies repeat idempotency, row preservation, the exact
schema/RLS/ACL/function fingerprint, entitlement-write denial, and concurrent
shared LiveKit rate limiting. To run it locally, start a disposable PostgreSQL
17 database and set only its loopback URL:

```bash
MIGRATION_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/meelni_test \
  npm run test:database-migrations
```

Never point this command at Preview or Production; the guard intentionally
rejects non-loopback databases.

The read-only deployment preflight and rollout sequence are documented in
[Deployment Preflight](./deployment-preflight.md). Database migration authority
remains separately documented in [Database Migrations](./database-migrations.md).
