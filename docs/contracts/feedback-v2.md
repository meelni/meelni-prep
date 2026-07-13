# Feedback v2 Contract

Status: additive v2 write contract; legacy v1 read compatibility retained

## Purpose

Feedback v2 makes each PM-interview finding traceable to durable transcript
evidence. `packages/core/src/feedback-v2.ts` owns the types, exact object shape,
canonical score calculation, and strict parser. Provider adapters receive
unknown JSON and may persist it only after this parser accepts it.

Rejected writes use the closed `feedback-v2-rejection.v1` taxonomy exported by
`@meelni/core`. A `FeedbackV2ParseError` contains one allowlisted invariant code
and a local developer message. Provider adapters may propagate the code, but
must not retain or log the rejected response, evidence text, transcript text,
unknown field names, paths, or the parser error as a cause.

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
- `quote` resolves to a non-empty, case-sensitive substring of the referenced
  durable user turn. Harmless Unicode punctuation and whitespace differences
  may be normalized, but the persisted value is always sliced byte-for-byte
  from the canonical transcript. The parser rejects paraphrases, altered
  capitalization, interviewer speech, and unknown references.
- The same `(turnRef, quote)` evidence identity cannot be repeated across
  findings. A turn can support separate findings only with distinct exact
  evidence spans.
- `confidence` is a finite number from zero through one. It is a finding-level
  evidence signal, not a readiness probability.
- Unknown fields at the result, score, finding, or evidence level are rejected.

## Rejection taxonomy

The closed codes identify only the rejected invariant. They are grouped as:

- envelope and identity: `response_not_object`, `response_unknown_field`,
  `schema_version_mismatch`, `prompt_version_mismatch`,
  `rubric_version_mismatch`, `evaluation_state_mismatch`, and
  `model_version_invalid`;
- canonical input: `canonical_transcript_empty`,
  `canonical_transcript_turn_invalid`, and
  `canonical_transcript_duplicate_event_id`;
- scores and findings: `scores_not_object`, `scores_unknown_field`,
  `score_invalid`, `findings_count_invalid`, `finding_not_object`,
  `finding_unknown_field`, `finding_dimension_invalid`,
  `finding_rubric_version_mismatch`, `finding_text_invalid`,
  `transcript_refs_invalid`, `transcript_refs_duplicate`, and
  `confidence_invalid`;
- evidence: `evidence_count_invalid`, `evidence_not_object`,
  `evidence_unknown_field`, `evidence_turn_ref_invalid`,
  `evidence_turn_ref_duplicate`, `evidence_turn_ref_not_found`,
  `evidence_turn_ref_wrong_speaker`, `evidence_quote_invalid`,
  `evidence_quote_not_grounded`, `evidence_reference_set_mismatch`, and
  `evidence_reused_across_findings`;
- terminal copy and fail-closed fallback: `drills_invalid`, `summary_invalid`,
  and `parser_internal_failure`.

Unknown, absent, forged, or mutable diagnostic values normalize to
`parser_internal_failure` at a report boundary. The fallback means the parser
failed without a trustworthy invariant classification; it never permits output
repair or acceptance.

The provider adapter, not the provider response or an arbitrary caller,
authenticates the diagnostic. A module-private association backs a
non-configurable error accessor, so constructing or mutating an exported error
cannot mint a trusted allowlisted code. The report boundary reads the private
association directly, so proxying the error cannot mint one either.

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

## Transcript validation boundary

`packages/core/src/feedback-transcript.ts` prepares untrusted transcript data
before both eligibility and model evaluation:

- malformed or non-v2 canonical events fail closed for new feedback;
- bounded event/text lengths and invalid control or replacement characters are
  treated as corruption;
- exact and near-identical semantic replays are normalized across ASR
  punctuation and small lexical variants, then removed before turn and
  substantive-answer thresholds are calculated;
- substantive answers require minimum length and lexical variety, so repeated
  filler cannot create numerical precision;
- no usable user speech routes to `insufficient`;
- high-confidence instruction-injection and direct score-manipulation shapes
  route to `insufficient` and are never sent to the evaluation model; ordinary
  product discussion about injection defenses remains evaluable;
- worker and direct-evaluation entry points repeat the guard so a late corrupt
  read cannot become scored feedback.

`insufficient` is represented by a skipped feedback record with reasons and
recommendations, never a v2 score object. Existing completed legacy feedback
remains readable without reinterpretation. These deterministic controls do not
claim exhaustive adversarial coverage or hiring calibration.

Only parsed v2 results may enter the
[deterministic drill recommendation contract](./drill-recommendations.md).
Insufficient, skipped, abandoned, failed, legacy, or malformed feedback cannot
receive a score-derived fallback recommendation.

Persistence, event fencing, retries, and insights handoff follow the
[feedback generation contract](./feedback-generation.md).
