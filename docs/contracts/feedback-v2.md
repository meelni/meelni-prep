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

Persistence, event fencing, retries, and insights handoff follow the
[feedback generation contract](./feedback-generation.md).

## Read and presentation boundary

Persisted completed rows are untrusted input when read back. The canonical
presenter in `packages/core/src/feedback-view-model.ts` produces exactly one of:

- validated `v2`, with the exact supported version tuple, complete scores,
  structurally valid findings and evidence, and an overall score that matches
  the canonical v2 weighting;
- validated `legacy`, with a completely absent v2 tuple, explicitly bounded
  historical strings, complete in-range scores, and an explicit
  historical-feedback label;
- `invalid`, which contains no scores or findings and is shown as unavailable.

Historical feedback keeps the separately model-authored overall score used by
the legacy writer. It is not reweighted using v2 rules and is never described
as transcript-grounded or personalized. Missing, out-of-range, or malformed
legacy data still fails closed.

The API emits a redacted integrity log when a completed row is invalid. The log
contains only environment, release, and opaque session correlation; it never
contains findings, transcript text, user identity, or raw persisted payloads.

The v2 finding presentation order is observation, every transcript evidence
excerpt, then a specific next action. Finding confidence is described as
evidence strength, not interview readiness. `0.8–1` is strong evidence,
`0.6–0.79` is moderate evidence, and values below `0.6` are limited evidence.

The read model reserves a nullable, typed next-practice recommendation seam for
SAV-201. SAV-200 validates stored model-authored exercise strings as untrusted
persisted data, but excludes them entirely from the customer/API read model.
They cannot be ranked, rendered, or acted on until SAV-201 supplies the
deterministic recommendation contract; finding-level `nextStep` remains the
actionable guidance in the meantime.

All persisted strings crossing the read boundary have explicit field-specific
limits. Identifiers and model/rubric versions are limited to 256 characters;
summaries to 4,000; observations and next actions to 2,000; evidence quotes and
historical notes to 4,000; stored-but-hidden exercise strings to 2,000; and
database numeric string representations to 32. Numeric strings must use plain
unsigned decimal notation before range validation. Oversized or malformed
values fail closed as `invalid` rather than reaching the API response.
