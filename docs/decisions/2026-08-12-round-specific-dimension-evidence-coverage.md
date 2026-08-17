# Round-Specific Dimension Evidence Coverage

Status: accepted

Date: 2026-08-12

Amended on 2026-08-17 by
[Require A Total For Every Customer Scorecard](2026-08-17-total-required-scorecards.md).
The round-specific facet and coverage derivation below remains accepted. Its
partial-scorecard reduction and presentation policy is superseded: incomplete
weighted coverage now produces scoreless Coaching review.

## Decision

Meelni scores post-interview feedback from round-specific PM-rubric dimension
evidence over SAV-369 candidate answer blocks. Surface grammar, punctuation,
answer length, transcript-row count, and keyword presence do not establish PM
competence or numerical precision.

The provider returns only one closed nullable answer-block alias slot per
configured facet plus nullable dimension scores. The provider adapter maps
those slots into closed facet-code selections; core resolves exact candidate
evidence and derives coverage, result mode, overall score, summary, and
persisted presentation. Coverage is `absent`, `partial`, or `sufficient`. A
Scorecard requires sufficient coverage and a score for every weighted core
dimension plus the canonical overall. Any incomplete weighted coverage with
grounded usable evidence produces a scoreless Coaching review. No usable
answer and transcript integrity degradation remain the only Unable states.

Equivalent semantic answers under different event segmentation must have
identical coverage, scores, mode, citations, and persistence. Canonical events
remain immutable integrity provenance; answer blocks remain the only derived
evaluation/presentation abstraction.

## Consequences

- Unsupported dimensions and overall scores cannot be fabricated.
- One concise answer block may sufficiently cover a dimension; no row-count
  breadth is required.
- Provider prose, quote text, confidence, coverage, mode, overall, and event IDs
  are rejected.
- Existing v1/v2/evidence-limited completed rows remain readable and immutable.
- New incomplete-coverage rows are scoreless; numerical aggregate consumers
  continue to require a validated canonical overall. Historical sparse rows
  remain immutable and project as Coaching review.
- All adversarial and calibration fixtures are synthetic. No provider or
  Production action is authorized by this decision.

This decision supersedes the strict scoreable-answer-count numerical threshold
in [Evidence-Gated Feedback Outcomes](2026-08-10-evidence-gated-feedback-outcomes.md)
for new dimension-coverage evaluations. Its integrity, lifecycle, and legacy
compatibility decisions remain active.
