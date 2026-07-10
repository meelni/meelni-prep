# Feedback v2 Contract

Status: additive v2 write contract; legacy v1 read compatibility retained

## Purpose

Feedback v2 makes each PM-interview finding traceable to durable transcript
evidence. `packages/core/src/feedback-v2.ts` owns the types, exact object shape,
canonical score calculation, and strict parser. Provider adapters receive
unknown JSON and may persist it only after this parser accepts it.

## Versions and evaluation state

Every v2 result stores:

| Field             | Value or rule                                               |
| ----------------- | ----------------------------------------------------------- |
| `schemaVersion`   | `feedback.v2`                                               |
| `promptVersion`   | `feedback.prompt.v2`                                        |
| `modelVersion`    | Non-empty configured provider model identifier              |
| `rubricVersion`   | `pm-feedback-rubric.v2`                                     |
| `evaluationState` | `full` or `partial`, matching committed completion evidence |

`partial` means conclusions are limited to the recorded portion. It is not a
prediction of interview readiness. `insufficient` and `abandoned` sessions are
skipped and receive no v2 result.

## Finding shape

Each strength and improvement contains exactly these fields:

```json
{
  "dimension": "insight",
  "observation": "The answer chose a specific user segment.",
  "transcriptRefs": ["writer-id:event-id"],
  "evidence": [
    {
      "turnRef": "writer-id:event-id",
      "quote": "working parents"
    }
  ],
  "nextStep": "Carry that segment through prioritization.",
  "rubricVersion": "pm-feedback-rubric.v2",
  "confidence": 0.9
}
```

- `dimension` is one of structure, clarity, insight, communication, or
  leadership.
- `transcriptRefs` contains unique canonical transcript `eventId` values. A
  database row UUID is not a feedback evidence identity.
- Every reference has exactly one evidence entry and vice versa.
- `quote` is a non-empty, case-sensitive substring of the referenced durable
  turn. The parser rejects paraphrases, altered capitalization, and unknown
  references.
- `confidence` is a finite number from zero through one. SAV-196 owns policy
  thresholds and adversarial confidence validation.
- Unknown fields at the result, score, finding, or evidence level are rejected.

## Scores

Dimension scores are integers from zero through ten. The model does not return
an overall score. Core calculates it from the single canonical PM weighting in
`packages/core/src/evaluation.ts`:

- structure: 25%
- clarity: 20%
- insight: 25%
- communication: 15%
- leadership: 15%

## Persistence and compatibility

The existing feedback columns remain in place. V2 stores structured findings
in the existing JSONB arrays and adds nullable schema, prompt, model, and
evaluation-state columns. The database enforces either a completely absent v2
version tuple for a legacy row or a complete, internally consistent v2 tuple.
Historical string-array v1 rows keep `rubric_version=1.0.0` and remain readable.
New completed writes use v2 only.

## Ownership boundary

SAV-195 guarantees structural completeness and exact quote-to-turn grounding.
SAV-196 owns adversarial and low-signal policy, normalization or regeneration,
repeated-turn inflation defenses, prompt-injection/corruption/missing-user-
speech fixtures, and honest precision thresholds. Passing this parser is not a
claim of comprehensive adversarial launch validation.
