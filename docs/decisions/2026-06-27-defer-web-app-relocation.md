# Defer Physical Web App Relocation

Status: accepted

Date: 2026-06-27

## Context

Meelni is moving toward a monorepo shape inspired by Nomu:

```text
apps/
  web/
  voice-agent/
packages/
  core/
  agent/
  integrations/
```

The current Next.js app still runs from the repository root. A physical move to
`apps/web` would affect `app/`, `components/`, `lib/`, `public/`,
`middleware.ts`, `next.config.ts`, `tsconfig.json`, `components.json`,
`drizzle.config.ts`, Vercel settings, Docker settings, and package scripts.

The repository still has hundreds of root-relative `@/*` imports and root-coupled
tooling assumptions. Moving the app now would be a high-blast-radius change that
is likely to break local development, deploys, or database tooling.

## Decision

Do not physically move the web app to `apps/web` in this migration slice.

Keep `apps/web` as the documented destination and continue draining stable
contracts into package entrypoints first.

## Move Readiness Checklist

The app can move once these are true:

1. Package entrypoints own all provider-independent contracts used across routes,
   UI, tests, and scripts.
2. Root `@/*` imports are either local to the web app or covered by an explicit
   `apps/web` TypeScript path plan.
3. `drizzle.config.ts` and database scripts resolve schema paths from the new
   app location or from a database package.
4. `components.json`, Tailwind/PostCSS, middleware, Next config, Docker, Vercel,
   and Conductor paths have an `apps/web` equivalent.
5. `npm run typecheck`, focused package tests, and a local Next startup pass
   from the new location.

## Consequences

- The current app remains deployable from the root while shared boundaries
  become agent-friendly.
- Future agents have a clear checklist for the eventual move.
- The migration avoids a large path-only diff that would obscure behavioral
  regressions.
