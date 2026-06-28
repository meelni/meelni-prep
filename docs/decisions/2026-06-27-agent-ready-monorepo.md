---
status: accepted
date: 2026-06-27
tags:
  - architecture
  - agents
  - monorepo
---

# Agent-Ready Monorepo Direction

## Decision

Meelni will adopt an agent-ready monorepo destination with `apps/*`, `packages/*`, repo-local skills, durable engineering memory, and OpenSpec-style behavior artifacts.

The migration will be incremental. The existing root Next.js app and Python LiveKit agent remain operational while shared contracts and workflows move into packages by vertical slice.

## Context

The current codebase has valuable product surfaces but mixes product behavior, provider integrations, app routes, and agent runtime details across the root app and `agent/` folder. The product is being restarted and will need rapid agent-assisted iteration.

Nomu provides a useful reference architecture: canonical `AGENTS.md`, repo-local skills symlinked into Codex and Claude, durable decision records, contracts, OpenSpec artifacts, local setup/doctor tooling, and runtime/provider boundaries.

## Consequences

- New durable behavior should have a clear home in docs, contracts, specs, or packages.
- Future agents should start from `AGENTS.md` and Meelni-specific skills instead of rediscovering context.
- Package stubs can exist before the full app move, but they should gain code only when a real migration slice needs them.
- A full `apps/web` move is deferred until shared imports use package public entrypoints.

## Follow-Ups

- Move shared interview and feedback types into `@meelni/core`.
- Move room metadata and transcript event contracts into `@meelni/agent`.
- Add provider adapter contracts in `@meelni/integrations`.
- Decide later whether the voice runtime remains Python or moves to a TypeScript `apps/voice-agent`.
