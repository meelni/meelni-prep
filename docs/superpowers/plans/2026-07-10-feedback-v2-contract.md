# SAV-195 Feedback v2 Contract Plan

## Intent

Define one additive, evidence-grounded feedback contract for relaunched PM
interviews. New feedback must be structurally complete, traceable to canonical
transcript events, explicitly versioned, and honest about whether it evaluates
a full or partial interview. Existing version 1 rows remain readable.

## Architecture checkpoint

- `packages/core` owns the PM dimensions, score weights, feedback-v2 types,
  strict parsing, and overall-score calculation.
- Stable transcript references are canonical transcript `eventId` values.
  Database row IDs are not evidence identities.
- Every v2 strength and improvement includes a dimension, observation,
  transcript references, exact transcript evidence, a next step, rubric
  version, and confidence.
- An evidence quote is valid only when it is a non-empty, case-sensitive
  substring of the referenced canonical turn. Every declared transcript
  reference must have evidence and every evidence reference must be declared.
- The provider adapter supplies the configured model version and passes unknown
  JSON through the strict core parser. It does not infer dimensions, repair
  missing evidence, clamp scores, or trust model-computed overall arithmetic.
- New database columns are nullable and additive. A version tuple is either
  wholly absent for a legacy row or wholly present for feedback v2.
- `full` and `partial` are explicit evaluation states. Insufficient and
  abandoned sessions remain skipped and do not receive scores.
- API and UI consumers accept a legacy string-array shape or the structured v2
  shape. New writes use v2 only.

## Vertical slice

1. Add feedback-v2 types, constants, strict parser, and deterministic fixtures.
2. Update prompts and the OpenAI adapter to request and parse only v2.
3. Persist structured findings plus schema, prompt, model, rubric, and
   evaluation-state versions in the asynchronous worker.
4. Add an additive Drizzle migration and verify clean and legacy upgrades.
5. Expose version/state fields through the feedback API and render evidence in
   the feedback page while retaining v1 display behavior.
6. Document the contract and test representative PM round fixtures.

## SAV-196 boundary

SAV-195 owns the contract and its structural grounding invariant, including
exact quote-to-turn-reference matching. SAV-196 owns adversarial and low-signal
policy, regeneration or normalization behavior, repeated-turn inflation
defenses, prompt-injection/corruption/missing-user-speech fixtures, and honest
precision thresholds. This slice does not claim comprehensive adversarial
launch validation.

## Validation

- Core parser tests cover valid full/partial output and rejection of incomplete,
  ungrounded, duplicate, version-mismatched, and out-of-range output.
- Deterministic golden fixtures cover the canonical Product Sense, Execution,
  Behavioral, and Strategy rounds without live model calls.
- API/UI compatibility tests cover both version 1 and version 2 records.
- Drizzle generation/check plus clean and legacy PostgreSQL migration tests.
- `npm run check:ci`, production build, and local runtime verification.
- Whole-diff P0/P1 audit before publishing a stacked draft PR.
