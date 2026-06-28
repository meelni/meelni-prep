# Target Monorepo

Meelni is adopting an incremental monorepo destination while preserving the current root app during migration.

## Target Shape

```text
apps/
  web/
  voice-agent/
packages/
  core/
  agent/
  integrations/
  test-fixtures/
```

## Current State

- The Next.js app still lives at the repository root.
- The Python LiveKit runtime still lives in `agent/`.
- The first workspace packages are stubs and should only gain code when a vertical slice needs a shared boundary.

## Migration Rules

1. Do not move the whole app at once.
2. Move stable contracts before moving routes or pages.
3. Move behavior by vertical slice: question practice, session lifecycle, feedback, insights, billing, then app shell.
4. Keep imports flowing through package public entrypoints.
5. Validate the current app after every slice.

## First Package Responsibilities

- `@meelni/core`: PM interview domain contracts and provider-independent workflows.
- `@meelni/agent`: voice interview runtime contracts shared by web and agent.
- `@meelni/integrations`: provider adapter contracts and normalization helpers.
- `@meelni/test-fixtures`: reusable scenario data for regression tests.
