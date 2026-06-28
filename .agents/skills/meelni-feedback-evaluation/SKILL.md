---
name: meelni-feedback-evaluation
description: Work on Meelni feedback, scoring, PM interview rubrics, transcript evaluation, drills, insights, feedback polling, skipped/partial feedback states, or dashboard analytics.
---

# Meelni Feedback Evaluation

Use this skill for scoring, rubric prompts, post-session feedback, drills, insights, and evaluation reliability.

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

## Quality Bar

- Feedback should cite evidence from the transcript when possible.
- Scores should be calibrated per interview type.
- Drills should map to the weakest dimensions.
- Short or failed sessions should produce helpful states, not fake precision.
