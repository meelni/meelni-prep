---
name: meelni-feedback-evaluation
description: Work on Meelni feedback, scoring, PM interview rubrics, transcript evaluation, practice exercises, insights, feedback polling, skipped/partial feedback states, or dashboard analytics.
---

# Meelni Feedback Evaluation

Use this skill for scoring, rubric prompts, post-session feedback, practice exercises, insights, and evaluation reliability. Treat evaluation as core product behavior: feedback must be useful, evidence-grounded, calibrated, and honest about uncertainty.

## Read First

- `AGENTS.md`
- `lib/evaluation/prompts.ts`
- `lib/evaluation/rubric-engine.ts`
- `lib/evaluation/session-validator.ts`
- `lib/evaluation/insights-aggregator.ts`
- `components/feedback/`
- `app/api/feedback/`
- `app/api/eval/`
- Relevant contracts in `docs/contracts/`

## Workflow

1. Identify the interview type and feedback state affected.
2. Inspect transcript shape, validation rules, feedback status handling, and dashboard consumers.
3. Keep rubrics PM-calibrated and evidence-based.
4. Preserve clear behavior for completed, pending, processing, failed, skipped, abandoned, and insufficient sessions.
5. Add or update fixtures/tests for real feedback behavior instead of source-shape assertions.
6. Update contracts or OpenSpec artifacts when response shapes or durable behavior changes.

## Evaluation Gates

### Product Validity

- Feedback should help a PM candidate improve their next interview, not just summarize the transcript.
- Scores must map to the interview type and rubric dimension, not a generic communication score.
- Strengths and gaps should cite transcript evidence when available.
- Practice exercises should target the weakest actionable dimension and be doable in a short practice loop.
- Short, failed, abandoned, or low-signal sessions should not produce fake precision.

### Data And State Integrity

- Preserve the distinction between session status, feedback status, transcript quality, and insight aggregation state.
- Treat retries and duplicate Inngest events as normal; generation should be idempotent or safely resumable.
- Do not overwrite completed feedback with lower-quality or partial output.
- Polling responses should give the UI a clear user-facing state and recovery path.
- Avoid storing raw provider errors or prompt internals in user-visible fields.

### Prompt And Model Safety

- Rubric prompts should constrain the evaluator to PM interview behavior and the supplied transcript.
- Do not let model/provider tuning become an end-user control unless product strategy accepted it.
- Avoid prompt changes that silently alter scoring scale, status behavior, or practice-exercise selection without fixtures.
- Preserve `drills` only where it is an existing API, database, or provider compatibility key; translate it to practice-exercise language before it reaches user-facing copy or product guidance.
- If using transcript excerpts, keep privacy and redaction expectations explicit.

### Fixtures And Regression Tests

- Add fixtures for new scoring behavior, transcript edge cases, skipped feedback, and failure states.
- Prefer assertions on observable feedback quality and status transitions over brittle prompt text matching.
- Include at least one negative or low-signal case when changing evaluation thresholds.
- If tests cannot cover the model output directly, test the parser, validator, state machine, prompt inputs, and fallback path.

## Quality Bar

- Feedback should cite evidence from the transcript when possible.
- Scores should be calibrated per interview type.
- Practice exercises should map to the weakest dimensions.
- Short or failed sessions should produce helpful states, not fake precision.

## Output

Use:

```markdown
## Evaluation Impact

- Interview type/state:
- User-facing behavior:
- Data/status behavior:

## Quality Gates

- Calibration:
- Evidence:
- Failure states:
- Fixtures/tests:

## Validation

- Commands:
- Manual checks:

## Risks

- ...
```
