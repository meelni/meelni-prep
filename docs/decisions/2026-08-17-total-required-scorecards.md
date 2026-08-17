# Require A Total For Every Customer Scorecard

Status: accepted

Date: 2026-08-17

Supersedes the customer outcome and partial-scorecard policies in:

- [Four-Outcome Feedback Presentation](2026-08-13-four-outcome-feedback-presentation.md)
- [Round-Specific Dimension Evidence Coverage](2026-08-12-round-specific-dimension-evidence-coverage.md)
- [Durable Interview-To-Feedback Loop](2026-08-13-durable-interview-to-feedback-loop.md)

## Decision

Meelni presents terminal feedback as exactly Scorecard, Coaching review, or
Unable to review.

A Scorecard is a closed numerical result. It contains a valid score for every
weighted PM dimension and the canonical weighted overall. If trustworthy
evidence cannot support that complete result, the review is scoreless coaching;
Meelni does not renormalize supported dimensions, zero-fill missing dimensions,
extrapolate an excluded tail, or use transcript length or grammar to manufacture
a total.

The exact content-free `interviewer/no_provider_confirmed_prefix` marker remains
transparent to prompt/answer continuity. A healthy, settled, gap-free frozen
authority whose trusted projection covers every candidate answer block may
authorize complete scorecard reduction even when the snapshot is labeled
partial solely because exact safe markers were present. A real excluded or
unverified candidate tail, incomplete weighted-dimension coverage, or another
bounded evidence limitation produces scoreless coaching.

Candidate markers, canonicalization failures, replay conflicts, sequence gaps,
writer or cutoff conflicts, corrupt persistence, and no-reviewable-answer
states retain their strict fail-closed Unable behavior.

Core exports one discriminated customer projection and owns all eligibility and
reduction. Workflows supply normalized frozen/trusted facts. Authenticated
reads, Dashboard/History, comparison, quality signals, analytics, UI, and local
tooling consume the projection and never infer an outcome from nullable scores.

## Compatibility

Historical rows remain immutable. Supported persisted partial-scorecard rows
are revalidated under their original versioned contract, then projected as a
scoreless Coaching review. Their sparse stored dimension values do not cross
the customer boundary and are not rewritten, renormalized, or admitted to
overall aggregates. Unknown or incoherent rows remain unavailable.

## Consequences

- The term `Partial scorecard` leaves customer UI and customer outcome events.
- Numerical aggregates, comparisons, trends, and progress continue to require
  a validated canonical overall.
- Safe-marker and no-marker segmentations with identical trusted candidate
  scope reduce identically.
- The change may extend storage constraints for new coherent tuples without
  rewriting existing rows; applying any migration remains a separately
  authorized operation.
- All committed transcript-like regressions remain fully synthetic. This
  decision authorizes no Production or provider access, credit mutation,
  migration application, deployment, launch, merge, or customer-data use.
