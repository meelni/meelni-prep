# SAV-453 total-required scorecards

## Why

The four-outcome contract allows a customer result called a Partial scorecard
to expose some dimension scores without a total. It also treats any exact safe
interviewer marker as a permanent bar to an overall even when frozen authority
is healthy, settled, gap-free, and covers every candidate answer block. Both
behaviors weaken the meaning of Scorecard.

## What changes

- Replace Full scorecard, Partial scorecard, Coaching review, and Unable to
  review with Scorecard, Coaching review, and Unable to review.
- Require every Scorecard to contain all five weighted dimension scores and the
  canonical overall.
- Reduce incomplete trusted numerical coverage to scoreless Coaching review.
- Allow a safe-marker-only partial snapshot with complete trusted candidate
  scope and complete dimension coverage to reduce to Scorecard.
- Preserve strict integrity failure and immutable historical rows.
- Export one closed core projection for production reads/UI and SAV-454/SAV-455
  local tooling.

## Non-goals

- Rubric, facet, scale, weighting, provider, or prompt-tuning changes.
- Historical rewrites or backfills.
- Production/customer data, provider calls, credit mutation, migration
  application, deployment, launch, merge, or SAV-454/SAV-455 implementation.
