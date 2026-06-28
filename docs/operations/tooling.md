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

## Validation

Use targeted validation while the monorepo migration is in progress:

```bash
npm run test:local
npm run typecheck
npm run lint
```
