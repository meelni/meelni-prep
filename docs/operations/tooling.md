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

Run all local runtime processes:

```bash
npm run dev:local
```

This is the normal coding-agent run target. It starts the Next.js dev server, starts the Inngest Dev Server against `/api/inngest`, and attempts to start the Python LiveKit agent if `agent/venv` exists. If dependencies are missing, it runs `npm run setup:local` first.

Agent platforms that honor `conductor.json` should use:

- setup: `npm run setup:local`
- run: `npm run dev:local`

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
