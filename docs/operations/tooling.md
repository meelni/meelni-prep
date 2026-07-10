# Tooling

## Local Setup

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

The doctor checks Node, npm, dependencies, local env files, Python availability, Python agent environment, and Conductor configuration.

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

The public relaunch gate uses Statsig network evaluation only after current analytics acceptance. Undecided and declined visitors use `MEELNI_REACTIVATION_DEFAULT` without constructing a Statsig client. Keep it `false` before relaunch and change it to `true` only as part of the rehearsed launch flip. Because declined users cannot receive a Statsig-only rollback, changing the fallback requires a Vercel environment update and redeploy; use a separate strictly necessary configuration provider if an instant consent-independent kill switch becomes mandatory.

Set `ANALYTICS_PSEUDONYM_KEY` independently in Preview and Production to at least 32 cryptographically random characters. Treat rotation as an analytics identity reset. Do not reuse Supabase, Stripe, LiveKit, or PostHog credentials. Missing or short values fail closed for authenticated identification and consent-aware billing events.

PostHog ingestion uses `NEXT_PUBLIC_POSTHOG_KEY` (`phc_`) on both browser and server. Personal `phx_` keys are management credentials and must not be configured as capture keys. Preview verification should seed representative old `ph_*_posthog` storage/cookies, confirm their one-time removal before opt-in, and inspect final outbound payloads for query strings, referrers, campaign fields, device/session IDs, or unexpected person properties.

In local development, the feature-flag menu stores an on/off cookie and reloads the page so the server-rendered body, metadata, and client controls use the same state.

## Local Inngest Feedback

Run the Inngest dev server while testing post-interview feedback:

```bash
npx inngest-cli@latest dev
```

The app explicitly uses Inngest dev mode outside `NODE_ENV=production`, so copied Vercel metadata in `.env.local` does not require `INNGEST_EVENT_KEY` for local event sends. Feedback evaluation still requires a nonblank `OPENAI_API_KEY` in `.env.local`.

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

## Database Migration Verification

The ten-entry Drizzle migration chain must support both an empty database and the
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
[Database Migrations](./database-migrations.md).
