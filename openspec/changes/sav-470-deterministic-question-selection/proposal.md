# Change: Deterministic Pre-Room Question Selection

## Why

Question-free full-interview starts currently depend on database randomness.
They need a bounded, explainable choice that respects practice history and only
valid feedback evidence, compiles into the SAV-468 brief, and replays exactly.

## What Changes

- Add a provider-free, typed, versioned TypeScript ranker and explicit scoring
  table.
- Load one bounded normalized candidate/history/evidence context before room
  entry and replace only the question-free random start path.
- Keep explicit question launches as an early absolute override.
- Persist a compact reason/version receipt and selected snapshot with the exact
  compiled `InterviewBriefV2`.
- Use deterministic embedded round fallbacks when no eligible catalog candidate
  is available.

## Impact

- Affected specs: full-interview question selection and stable start replay.
- Affected code: `packages/core`, `lib/db`, session-start workflow, shared
  synthetic fixtures.
- Data: existing session `config` JSON plus migration
  `0042_sav_470_question_ranking_indexes`, which adds only the bounded
  candidate/history read indexes.
- Provider/Production behavior: no provider mutation, Python read, launch
  decision, merge, or Production action is included.
