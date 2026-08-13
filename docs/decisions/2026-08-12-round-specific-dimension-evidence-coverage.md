# Round-Specific Dimension Evidence Coverage

Status: accepted

Date: 2026-08-12

## Decision

Meelni scores post-interview feedback from round-specific PM-rubric dimension
evidence over SAV-369 candidate answer blocks. Surface grammar, punctuation,
answer length, transcript-row count, and keyword presence do not establish PM
competence or numerical precision.

The provider returns only closed facet codes, answer-block aliases, and
nullable dimension scores. Core resolves exact candidate evidence and derives
coverage, result mode, overall score, summary, and persisted presentation.
Coverage is `absent`, `partial`, or `sufficient`. A full scorecard requires
sufficient coverage for every core dimension. A partial scorecard scores only
sufficient dimensions and has no overall. Grounded usable evidence without a
fair numerical dimension produces a scoreless coaching review. No usable
answer and transcript integrity degradation remain the only unable-to-review
states.

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
- New partial rows use sparse scalar scores; numerical aggregate consumers
  continue to require overall and exclude partial/coaching rows.
- All adversarial and calibration fixtures are synthetic. No provider or
  Production action is authorized by this decision.

This decision supersedes the strict scoreable-answer-count numerical threshold
in [Evidence-Gated Feedback Outcomes](2026-08-10-evidence-gated-feedback-outcomes.md)
for new dimension-coverage evaluations. Its integrity, lifecycle, and legacy
compatibility decisions remain active.
