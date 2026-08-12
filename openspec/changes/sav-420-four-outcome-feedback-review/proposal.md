# SAV-420 four-outcome feedback review

## Why

The current feedback presentation equates a completed numerical review with a
five-dimension scorecard and calls every useful scoreless review
"evidence-limited." SAV-421 introduces dimension-level evidence coverage, so
that vocabulary can no longer explain which dimensions are supported, why an
overall is absent, or whether the blocker is rubric coverage or verified
evidence integrity.

## Outcome

Every terminal review surface presents exactly one customer outcome: Full
scorecard, Partial scorecard, Coaching review, or Unable to review. Numbers
come only from server-validated rubric-dimension coverage. Coaching remains
grounded and actionable without pseudo-scores. Integrity failures stay
system-owned and expose a truthful retry, credit, or recovery path.

## Boundaries

- Immutable transcript events remain the integrity source; derived answer
  blocks are the evaluation and presentation unit.
- Equivalent transcript segmentation cannot change score eligibility or the
  presented outcome.
- Clients never infer an outcome, withheld reason, unsupported dimension, or
  recovery state from missing fields.
- Partial scorecards show only supported dimension scores, label every
  unsupported dimension `Not enough evidence`, and show no overall.
- Coaching reviews use only validated grounded signals, confidence semantics,
  one server-selected practice focus, and exact candidate citations.
- System integrity failure never implies poor candidate performance and never
  exposes provider, parser, transcript, settlement, or internal reason codes.
- Overall trends remain overall-score-only. Scoreless outcomes never enter
  numeric metrics. Supported partial dimension scores may enter only a metric
  whose denominator explicitly counts that supported dimension.
- SAV-418 retains focused-practice persistence ownership. SAV-415 retains
  helpfulness storage and instrumentation ownership.
- No Production/customer transcript content or provider payload is used.
