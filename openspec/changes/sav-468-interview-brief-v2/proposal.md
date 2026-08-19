# Change: Compile And Consume Interview Brief V2

## Why

The SAV-466 contracts define a safe nested brief but do not yet prepare or use
one at session start. Full interviews need deterministic, replay-stable context
before room entry so the speech path does not fetch product or candidate data.

## What Changes

- Add four bounded PM round packs owned by core domain code.
- Compile one `InterviewBriefV2` from the accepted stable start and exact
  selected question, then persist its serialized wire in existing start config.
- Optionally attach the stored brief to room-metadata v1 under the accepted
  server-owned emission flag.
- Consume validated briefs in Python as constraints and probe catalogs, while
  keeping missing, unknown, invalid, and legacy v1 sessions on the existing
  prompt path.
- Export only sanitized prompt, policy, pack, brief, and resolution versions to
  tracing.

## Impact

- Affected specs: `stateful-interviewer-contracts`
- Affected code: `packages/core`, `packages/agent`, session start, Python full-
  interview runtime, shared fixtures
- Data: existing session `config` JSON stores the compiled wire; no migration
- Provider/Production behavior: unchanged unless the existing brief-v2 flag is
  explicitly enabled; no provider mutation is included
