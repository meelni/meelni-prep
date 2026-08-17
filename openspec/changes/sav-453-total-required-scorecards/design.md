# Design: Total-required customer scorecards

## Core reduction

Core receives the closed provider facet selection plus normalized frozen and
trusted-answer authority. It validates the original selection before deriving
one of two completed review shapes:

| Completed outcome | Coverage and authority                                                                             | Customer numerical fields                 |
| ----------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Scorecard         | Every weighted dimension is sufficient and the trusted scope contains every candidate answer block | All five dimensions and canonical overall |
| Coaching review   | Grounded review exists but any dimension is incomplete or a candidate tail is excluded             | None                                      |

Core never calculates an overall from a subset. It does not zero-fill,
renormalize, extrapolate, or promote grammar/length evidence.

An exact safe interviewer marker does not itself exclude a candidate block. A
`verified_prefix` projection with zero excluded blocks may therefore authorize
Scorecard when the writer is healthy and settled, the sequence and cutoff are
coherent, and all dimensions are sufficient. A nonzero excluded-block count
forces Coaching review. Integrity failures never reach evaluation.

## Public projection

`@meelni/core` exports `FeedbackCustomerProjection`,
`FeedbackScorecardView`, `FeedbackCoachingReviewView`, and
`toFeedbackCustomerProjection(FeedbackLifecycleResponse)`.

The discriminator is `scorecard | coaching_review | unable_to_review`.
Scorecard's review type requires every dimension and the canonical overall.
Coaching and Unable carry no dimension or overall score fields. Unknown,
malformed, transient, or internally incoherent values return `null`; the
existing lifecycle adapter renders unavailable rather than guessing.

## Persistence and compatibility

New writes persist only complete scorecards or all-null coaching results. A
safe-marker scorecard retains its verified projection binding so authenticated
reads can reproduce the zero-excluded scope before exposing the result.

Migration `0041_sav_453_total_required_scorecards` changes constraints only. It
admits the complete zero-excluded verified-prefix tuple, enforces all-null new
coaching rows, and version-gates the new quality-signal outcome enum. It does
not update, backfill, renormalize, or otherwise rewrite stored rows, and this
slice does not apply it.

Historical partial rows are not rewritten. Reads validate their original mode,
sparse scores, exact evidence, and scope, then discard the sparse numerical
fields while producing the closed Coaching review projection. Corrupt or
incoherent tuples remain unavailable.

## Consumers

Feedback, Dashboard/History, comparison, quality signals, analytics, fixtures,
and local tooling consume the public projection. They do not classify from
`overallScore`, nullable dimension fields, persisted mode strings, or transcript
shape. Overall aggregates admit only `scorecard` projections.

## Regression and privacy

The production-shaped regression is fully synthetic. Repeated safe markers and
the no-marker equivalent use identical synthetic candidate scope and assert
identical scores, overall, citations, and outcome. Separate fixtures cover a
real excluded tail, incomplete dimension coverage, integrity failures, and
corrupt persistence. No customer transcript or provider payload enters code,
tests, logs, docs, Linear, or review metadata.
