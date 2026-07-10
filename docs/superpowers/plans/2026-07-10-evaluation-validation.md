# SAV-196 Evaluation Validation

## Intent

- User request: make relaunch feedback trustworthy before the feature flag is enabled.
- Product outcome: unverifiable or low-signal interview transcripts never produce precise-looking scores.
- Why now: feedback v2 provides the strict result shape; this slice closes the transcript-integrity boundary that feeds it.

## Slice

- Primary slice: feedback/evaluation.
- Secondary slices: canonical transcript ingest and terminal session eligibility.
- Skills: `meelni-feedback-evaluation`, `meelni-livekit-interview-runtime`, and `meelni-vertical-slice-playbooks`.

## Linear Tracking

- Project: Meelni.
- Parent: SAV-168.
- Deliverable: SAV-196.
- State: In Progress.

## Scope

- In scope: canonical transcript preparation, duplicate-turn suppression, high-confidence prompt-injection rejection, user-speech evidence enforcement, conservative quote normalization, insufficient-state routing, fixtures, tests, and contract docs.
- Out of scope: calibrated hiring-readiness claims, rubric redesign, provider/model changes, and the SAV-197 workflow consolidation.
- Assumption: the relaunch runtime writes transcript contract v2 events; legacy feedback remains readable but non-canonical transcript input cannot create new v2 feedback.

## Technical Plan

1. Add a provider-neutral transcript preparation contract in `@meelni/core`.
2. Use the same prepared transcript for terminal eligibility, worker input, and direct evaluation entry points.
3. Fail closed for malformed canonical events, missing user speech, and high-confidence instruction injection; deduplicate replayed semantic turns before thresholds and evaluation.
4. Restrict feedback evidence to user turns, normalize only typographic punctuation/whitespace back to the exact canonical source substring, and reject repeated evidence identities.
5. Add adversarial fixtures and record the behavior in the feedback contract.

## Validation

- Required: targeted core/workflow/API tests, `npm run check:ci`, and `npm run build`.
- Fixtures: hallucinated quote, typographic quote normalization, prompt injection, repeated event/text, missing user speech, malformed canonical event, and short session.
- Manual: inspect the worker state transition to confirm rejected input is stored as `skipped`, never `completed` or scored.

## Rollout

- Risk: high because this changes feedback eligibility; fail closed while the relaunch flag remains off.
- Backward compatibility: legacy completed feedback is read unchanged; only new generation eligibility tightens.
- Follow-up: SAV-197 owns generation workflow consolidation and SAV-211 owns accessible feedback presentation.
