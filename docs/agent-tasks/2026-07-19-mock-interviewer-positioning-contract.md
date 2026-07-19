# Full-interview mock-interviewer positioning contract

## Intent

Align the authenticated voice runtime with Meelni's accepted category: realistic
live PM interview practice with evaluation after the interview, not an
in-session coaching experience.

## Slice

- Give full mock interviews a dedicated realistic-interviewer prompt contract.
- Ask adaptive round-specific follow-ups without frameworks, hints, suggested
  answers, or mid-session evaluation.
- Preserve the short public demo as a separate feedback-preview experience.
- Replace the active homepage coaching claim and align runtime guidance.
- Execute the generated default Python prompt for all four rounds in the
  product-language contract.
- Keep selected-question follow-ups coherent, normalize full-interview hints to
  off, and prove the metadata-to-prompt and demo-separation boundaries.
- Prevent the compatibility sanitizer from hiding customer-facing
  `Practice drills:` prose while still ignoring the exact legacy schema key.

## Out of scope

- Evaluation rubric, scoring, feedback-generation, or calibration changes.
- Provider/model/voice configuration or deployment.
- Feature-flag, migration, Production, or customer-data actions.
- Removing explicit non-mock teaching modes that are not reachable from the
  authenticated runtime.

## Validation

- `npm run typecheck`: passed with the complete isolated dependency runtime.
- `npm run test:python-agent`: 92 tests passed, including metadata-to-prompt
  coherence, canonical opening behavior, feedback-mode parity, and demo/full
  separation.
- `npm run test:agent`: 31 TypeScript agent-contract tests passed, including
  legacy feedback-mode normalization and authoritative serialized output as
  `end_only`.
- `npm run test:workflows`: 639 workflow and supporting contract tests passed.
- `npm run test:product-language`: 4 TypeScript and 20 contract tests passed,
  including complete synthetic disclosure and dialogue-only public playback.
- `npm run test:content`: 23 TypeScript and 7 credibility tests passed.
- `npm run test:local`: all 341 aggregate local contract tests passed.
- `npm run validate:skills`: all 16 Meelni skills passed.
- Scoped ESLint, Python compilation, prompt-generation checks, and
  `git diff --check`: passed.

## Tracking

Tracked under SAV-270. The local branch and eventual GitHub PR provide the
exact implementation and verification evidence until merge.
