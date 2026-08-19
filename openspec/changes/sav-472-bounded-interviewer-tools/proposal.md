# Change: Add Bounded Session-Scoped Interviewer Tools

## Why

The deterministic controller can own interviewer intent, but the model needs a
narrow way to read current local authority and propose one legal move. The
runtime also needs real lifecycle truth and bounded pinned-LiveKit continuation
before those tools can be exposed safely.

## What Changes

- Add exactly five typed, versioned, session-local tools for state, clock, probe
  candidates, move commit, and graceful close.
- Add a reader-first authenticated lifecycle snapshot/refresh boundary bound to
  the exact current transcript writer, while keeping tool execution in memory.
- Add deterministic deadlines, idempotency, move/revision authority, per-turn
  budgets, recursive-loop prevention, and typed fallback results.
- Extend the SAV-471 adapter with tool-mode-only same-handle continuation while
  preserving prompt-led single-use generation and opaque completion identity.
- Wire the tools through public pinned LiveKit APIs behind a second exact,
  disabled-by-default server flag.

## Impact

- Affected specs: `stateful-interviewer-contracts`
- Affected code: Python controller/tool/runtime adapters; authenticated internal
  lifecycle reader; focused benchmark and contract tests
- Data/provider behavior: one read-only current-writer lifecycle query when
  disabled gates are explicitly enabled; tools perform no remote operation
- Production behavior: unchanged by default; no environment, rollout, deploy,
  provider call, launch decision, or merge is included
