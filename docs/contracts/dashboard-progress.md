# Dashboard Progress Evidence

The dashboard may summarize PM interview practice only from completed feedback
that contains a valid rubric score. It reports observed practice evidence; it
does not predict interview readiness, hiring outcomes, question fit, or future
improvement.

## Scored Feedback Eligibility

A feedback record contributes to progress only when both conditions are true:

1. `feedback.status` is exactly `completed`.
2. `feedback.overallScore` is a finite number from 0 through 10.

Pending, processing, failed, skipped, missing, malformed, out-of-range, and
unscored feedback never contributes to score averages, trend bars, focus areas,
weakness patterns, or analytics evidence. A score-like value stored on any of
those records remains ineligible.

Dimension-level focus areas require the same eligible completed feedback plus
at least one finite 0–10 dimension score. When no dimension score exists, the
dashboard shows that a practice target needs scored dimensions; it does not
default to Metrics depth or any other weakness.

## Zero, One, And Many Scored Interviews

| Eligible scored interviews | Dashboard behavior                                                                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zero                       | No numeric score, progress bar, trend, focus area, or weakness pattern. Existing interview history keeps its real feedback state and the primary action starts another mock interview.                                                                          |
| One                        | Show the observed overall score on its 0–10 rubric scale and one observed bar. Label it as one scored interview; do not call it a trend. A focus area appears only when that feedback includes valid dimension scores.                                          |
| Two or more                | Show the one-decimal average of at most the five most recent eligible scores on the 0–10 scale. Comparison copy states the exact difference between the newest and oldest score in that window. Bars contain only those observed scores in chronological order. |

Visual bar height may convert a 0–10 score to 0–100 percent of the chart
container. That conversion is presentation only. Accessible labels and visible
score labels keep the source 0–10 rubric scale.

## Feedback-State Labels

- `pending` or `processing`: Feedback pending / Pending / Processing.
- `failed`: Feedback failed / Unavailable.
- `skipped`: Feedback skipped / Skipped.
- `completed` without a valid overall score: Score unavailable / Unscored.
- missing feedback: Not scored.
- eligible completed feedback: exact score and feedback-review link.

Only eligible feedback with valid dimension scores can contribute to repeated
patterns. One occurrence is described as the lowest scored dimension in that
feedback; only two or more occurrences may be called repeated.

## Question Bank

Question ordering may use stored facts such as `askedAt`, company, round, and
explicit user filters. The dashboard must not compute or display a question-fit
percentage from company-name length, round type, or another unsupported proxy.
The default Product Sense starting question is a deterministic product-policy
fallback, not a personalized fit claim.

## Shared Contract And Verification

- `@meelni/core` owns completed-score eligibility through
  `getCompletedFeedbackScore`.
- Dashboard summaries and the insights aggregator must use the shared rule.
- `@meelni/test-fixtures` supplies zero, one, many, and every-feedback-status
  regression scenarios.
- Behavior tests must prove that ineligible records cannot affect scores,
  progress bars, focus areas, patterns, or feedback links.

This contract implements the accepted live PM interview practice positioning.
Calibrated readiness or fit claims remain out of scope until a separately
accepted evidence and calibration gate exists.
