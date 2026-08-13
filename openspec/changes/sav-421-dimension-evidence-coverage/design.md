# Design: Dimension evidence coverage

## Integrity and evaluation units

Canonical transcript events remain the immutable integrity and byte-level evidence ledger. `deriveCandidateAnswerBlocks` remains the only grouping implementation. Generation and authenticated reads reconstruct the same frozen answer blocks; neither path rewrites transcript rows.

Provider input aliases each block as `answer-block:NNNN`. Equivalent semantic answers split into 1, 2, 5, or 10 events therefore produce the same provider input and persisted result projection. The server resolves every accepted alias back to a reconstructed block before accepting or presenting evidence.

## Closed semantic selection

Each supported round configures two assessable facets for each existing PM feedback dimension. The provider returns exactly:

- a fixed schema/prompt/rubric version and the requested round;
- all five dimension keys;
- for each dimension, a nullable integer score and zero or more `{ facetCode, answerBlockRef }` selections.

It cannot return coverage, mode, overall score, confidence, narrative, quote text, event IDs, or additional properties. Core rejects unknown/missing/duplicate dimensions, wrong-round facet codes, unknown block aliases, duplicate facet selections, and score/coverage mismatches.

## Coverage and mode reduction

- `absent`: no configured facet has grounded evidence.
- `partial`: exactly one configured facet has grounded evidence.
- `sufficient`: every configured facet has grounded evidence.

A concise answer may support multiple facets in one answer block; coverage never requires multiple transcript rows or punctuation. When numerical evaluation is allowed, a sufficient dimension requires an integer score from 0 through 10, while partial and absent dimensions require `null`.

- `full_scorecard`: all core dimensions are sufficient; canonical weighted overall is present.
- `partial_scorecard`: at least one but not all core dimensions are sufficient; only sufficient dimensions are scored and overall is absent.
- `coaching_review`: substantive frozen answer-block evidence exists but no fair numerical dimension is supported, or the frozen completion snapshot is qualitative-only; all scores and overall are absent.
- `unable_to_review`: integrity or no-usable-answer terminal state, represented by the existing immutable skipped outcome rather than a completed provider result.

Provider refusal, malformed output, or parser rejection remains a generation failure/retry lifecycle.

## Persistence and compatibility

New completed writes use an additive schema tuple and store the server-derived mode plus bounded dimension coverage JSON. Existing scalar score columns remain useful for aggregate queries: sparse dimensions may be populated for partial scorecards, and overall is populated only for full scorecards. Existing aggregate/trend consumers continue to require overall and therefore exclude partial/coaching rows.

Legacy, scored v2, and evidence-limited v2 completed rows keep their current parsers and are never rewritten or backfilled. An invalid new row renders unavailable rather than falling back to a historical parser.

## Privacy and operational boundaries

Only frozen, owner-authorized evidence reaches evaluation and authenticated presentation. No raw transcript, provider response, prompt, event IDs, session IDs, or customer content is added to logs, analytics, Linear, fixtures, or calibration artifacts. Calibration uses synthetic inputs only. This change ships migration source but does not run Production migrations or mutate providers.
