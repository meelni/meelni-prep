# Change: Add A Deterministic Interview Controller

## Why

The accepted stateful-interviewer contracts define the legal runtime state and
delivery evidence, but the current full-interview prompt still chooses pacing,
follow-up intent, and closure implicitly. Full interviews need one deterministic
authority for those decisions before any later tool or Director work can be
evaluated safely.

## What Changes

- Add a typed, versioned, serializable controller state and pure reducer outside
  LiveKit.
- Project deadline time from an authoritative wall-clock plus monotonic anchor
  and derive deterministic warning, closing, terminal, and allowed-move state.
- Admit at most one move after a completed candidate turn and emit one bounded
  prompt snapshot; the model owns wording only.
- Track admitted, generated, scheduled, spoken, interrupted, aborted, and
  canonically delivered move identities without committing undelivered history.
- Add a narrow Python runtime adapter behind an exact, server-owned flag that is
  disabled by default and fails safely to the existing interviewer path.

## Impact

- Affected specs: `stateful-interviewer-contracts`
- Affected code: Python shared controller/runtime adapter and the thin full-
  interview entrypoint
- Data/provider dependencies: none; canonical transcript acknowledgement,
  accepted deadline, and settlement evidence remain authoritative
- Provider/Production behavior: unchanged while the new flag is disabled; no
  provider call, rollout, default-on action, or launch decision is included
