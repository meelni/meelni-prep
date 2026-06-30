# Tooling

## Local Setup

Run:

```bash
npm run setup:local
```

This installs Node dependencies, creates `.context/npm-cache`, ensures `.env.local` exists from `.env.example` when possible, creates the Python virtual environment under `agent/venv`, and installs agent dependencies.

## Doctor

Run:

```bash
npm run doctor
```

The doctor checks Node, npm, dependencies, local env files, Python availability, Python agent environment, and Conductor configuration.

## Development

Run the web app only:

```bash
npm run dev
```

Run the Conductor-friendly local startup script:

```bash
npm run dev:local
```

The local script starts the Next.js dev server and attempts to start the Python LiveKit agent if `agent/venv` exists.

## Local Credit Bypass

`NODE_ENV=development` bypasses the interview credit ledger on local runs, even when `.env.local` includes Vercel metadata from `npm run env:pull`. `/api/billing/credits` returns a non-persistent dev balance, and `/api/session/start` reserves and consumes credits in memory.

Set `MEELNI_DISABLE_LOCAL_CREDIT_BYPASS=1` in `.env.local` to test the real credit ledger locally.

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
