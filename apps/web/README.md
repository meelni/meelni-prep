# Web App Migration Target

The current Next.js app still lives at the repository root (`app/`, `components/`, `lib/`, and related config).

This directory is the target home for the web app once shared behavior has moved behind package entrypoints. Do not move the app here in a big-bang rewrite. Migrate in this order:

1. Move shared contracts into `packages/core`, `packages/agent`, and `packages/integrations`.
2. Update root app imports to use package public entrypoints.
3. Move the Next.js app into `apps/web`.
4. Update Conductor, Vercel, Docker, and CI paths.

## Current Readiness

The physical move is intentionally deferred. See
`docs/decisions/2026-06-27-defer-web-app-relocation.md` for the checklist.
