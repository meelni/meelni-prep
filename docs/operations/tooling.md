# Tooling

## Local Setup

Run:

```bash
npm run setup:local
```

This installs Node dependencies, creates `.context/npm-cache`, ensures `.env.local` exists from `.env.example` when possible, creates the Python virtual environment under `agent/venv`, and installs agent dependencies. The Python venv is created with copied binaries instead of symlinked binaries so local Next.js/Turbopack builds do not walk into invalid absolute interpreter symlinks.

When `.env.local` is missing required runtime values or still contains placeholders from `.env.example`, setup attempts to self-heal by using the authenticated Vercel CLI:

```bash
npx vercel@latest link --yes --project meelni
npm run env:pull
```

If the Vercel CLI is not logged in, setup keeps going but prints the recovery command. Set `MEELNI_SKIP_ENV_PULL=1` only when you intentionally want to keep the current local env file unchanged.

If an older `agent/venv` uses symlinked Python binaries, setup recreates it with copied binaries. The venv is generated and gitignored, so this is safe and keeps `npm run build` compatible with a normal local setup.

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

The public relaunch gate is resolved on the server with a non-identifying operational Statsig user and disabled event logging. `MEELNI_REACTIVATION_DEFAULT` is the explicit provider-outage fallback: keep it `false` before relaunch and change it to `true` only as part of the rehearsed launch flip. Rollback changes the Statsig gate and this fallback together so a Statsig outage cannot invert the intended public state.

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

This runs the local doctor, canonical skill validation, TypeScript, local package tests, lint, and the production build. Python LiveKit agent tests run only when `agent/venv` exists.

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
[Database Migrations](./database-migrations.md).
