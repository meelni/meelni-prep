# Round-Specific Dimension Evidence Coverage

Status: `feedback.dimension-coverage.v1`

## Evaluation input

Immutable canonical transcript events remain the integrity source. After the
frozen transcript passes continuity, replay, timing, cutoff, and injection
checks, the SAV-369 `CandidateAnswerBlock` projection is the only evaluation
and presentation unit. The scoring workflow must not create another answer
grouping abstraction.

Equivalent semantic speech split across 1, 2, 5, or 10 adjacent transcript
events must produce identical answer-block text and aliases, provider input,
coverage, scores, mode, citations, and persisted evaluation content. Source
event IDs remain server-only integrity provenance and never become provider
output or persisted dimension selections.

## Closed provider selection

Each supported round (`product_sense`, `execution`, `behavioral`, `strategy`)
configures exactly two closed facets for each core dimension: structure,
clarity, insight, communication, and leadership. The provider may return only
the fixed selection versions, requested round, and all five dimension objects.
Each dimension contains a nullable integer score and zero to two
`{ facetCode, answerBlockRef }` selections.

The provider cannot author coverage, mode, overall score, confidence,
narrative, quote text, event IDs, or additional properties. Candidate answer
data is untrusted. Facet selection is based on PM-rubric evidence, never
punctuation, surface grammar, answer length, keywords alone, or transcript-row
count. The parser rejects wrong-round or duplicate facets, forged aliases,
extra fields, and score/coverage mismatches as generation failures.

## Server reduction

Coverage is derived per dimension:

- `absent`: no configured facet is grounded;
- `partial`: exactly one configured facet is grounded;
- `sufficient`: both configured facets are grounded.

One concise answer block may ground both facets. Multiple rows or blocks are
not required. When numerical scoring is permitted, and only then, a
`sufficient` dimension requires an integer score from 0 through 10. Partial
and absent dimensions always have a null score.

The server derives one customer outcome:

- `full_scorecard`: every core dimension is sufficient; every dimension has a
  score and the canonical weighted overall is present;
- `partial_scorecard`: at least one but not all core dimensions are
  sufficient; only sufficient dimensions have scores and overall is null;
- `coaching_review`: grounded usable evidence exists but no fair numerical
  dimension score is supported, or the frozen row is qualitative-only; every
  score and overall is null;
- unable to review: no usable answer or transcript integrity degradation. This
  remains the existing terminal skipped lifecycle and never invokes the
  provider.

Provider refusal, timeout, malformed JSON, invalid selection, or parser
failure is `generation_failed`; it is not translated into candidate
insufficiency.

## Exact evidence and persistence

For every accepted facet, core resolves the supplied alias against the same
reconstructed frozen answer blocks and stores the exact server-derived
`responseText`, stable block alias, facet code, and configured facet label.
Authenticated reads reconstruct the blocks again and compare every persisted
field before presentation. JSON object key order is irrelevant; value, array
order, versions, scores, aliases, labels, and exact evidence text must match.

New rows store the v3 version tuple, round, mode, and bounded dimension JSON.
Existing scalar score columns are sparse for partial scorecards and empty for
coaching. Overall is populated only for full scorecards. Legacy, Feedback v2,
and evidence-limited v2 completed rows remain readable and immutable; no
backfill or reinterpretation is allowed.

## Privacy and calibration

Raw transcript or provider content is never written to logs, traces,
analytics, Linear, fixtures, or review metadata. Provider observability records
only content-free round/block-count metadata and usage. All committed
adversarial and calibration fixtures are fully synthetic.

The provider-free `dimension-coverage-calibration.v1` corpus covers natural
spoken answers, punctuation-poor STT, concise answers, filler, keyword salad,
prompt injection, off-topic prose, sparse coverage, complete coverage for all
rounds, and segmentation equivalence. It validates closed outcomes and exact
grounding without credentials or provider calls.
