# Code Quality Checks

Meelni keeps the root Next.js app intact while package boundaries migrate
incrementally. The quality scripts are split by responsibility so failures point
to the right owner.

## Local Gates

- `npm run check`: default local confidence pass. Runs scoped Prettier,
  ESLint, app typecheck, test typecheck, and the quality toolchain.
- `npm run check:ci`: fuller CI pass. Runs `check` plus the core package and
  workflow regression tests.
- `npm run quality`: runs Biome, Knip, Dependency Cruiser, Semgrep, and the
  quality-script regression test.
- `npm run typecheck:tests`: complete tracked TypeScript test typecheck,
  including colocated `.test.*` and `.spec.*` files plus older `__tests__`
  directories. The quality regression compares the resolved TypeScript project
  with tracked test sources so a newly tracked test using these conventions
  cannot silently escape.
- `npm run typecheck:tests:all`: compatibility alias for the same complete test
  scope; it must not be broader than the default CI gate.

## Prerequisites

- `quality:security` runs pinned Semgrep `1.168.0` through `uvx`, which is provided by the
  Python `uv` toolchain. Install `uv` before running the aggregate checks:
  `curl -LsSf https://astral.sh/uv/install.sh | sh`. If `uvx` is missing,
  `npm run quality:security` exits with an actionable install message.

## Tool Ownership

- Prettier remains the source of truth for formatting, including Tailwind class
  ordering. `format:check:quality` covers the quality/tooling surface; the
  existing repo-wide `format:check` remains the cleanup backlog.
- ESLint remains the source of truth for Next.js, React, and React Hooks rules.
- Biome adds fast formatter/linter/import-organization checks for the tooling
  surface. Use `npm run quality:biome:fix` for safe automated fixes, and
  `npm run quality:biome:all` for a deliberate full-repo cleanup pass.
- Knip catches missing package declarations and unresolved imports in the
  default gate. Run `npm run quality:deps:all` for the current unused file,
  export, and dependency cleanup backlog.
- Dependency Cruiser enforces package direction and public package entrypoints.
- Semgrep catches security-sensitive patterns that should be low-noise in this
  codebase.

## Boundary Expectations

- `packages/core` must stay provider-independent.
- `packages/agent` should hold voice-agent runtime contracts and avoid app code.
- `packages/integrations` should normalize providers without importing app or UI
  modules.
- Consumers should import `@meelni/*` packages through public entrypoints, not
  deep source paths.
