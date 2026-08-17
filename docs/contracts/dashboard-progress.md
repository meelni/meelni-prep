# Dashboard Progress Evidence

The dashboard may summarize PM interview practice only from completed feedback
that contains a valid rubric score. It reports observed practice evidence; it
does not predict interview readiness, hiring outcomes, question fit, or future
improvement.

## Scored Feedback Eligibility

A feedback record contributes to progress only when all conditions are true:

1. The server-owned presentation kind is `scorecard`, proving a supported
   complete score tuple with every weighted dimension and a canonical total.
2. `feedback.status` is exactly `completed`.
3. `feedback.overallScore` is a finite number from 0 through 10.

Coaching reviews, unable outcomes, pending, processing, failed, missing,
malformed, out-of-range, and otherwise unscored feedback never
contribute to score averages, trend bars, focus areas, weakness patterns, or
analytics evidence. A score-like value stored on any ineligible record remains
ineligible.

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

## Feedback Reviewability And State Labels

- `pending` or `processing`: Feedback processing / Not scored yet.
- `failed`: Feedback failed / Not scored.
- Scorecard: Scorecard ready / Scorecard, with a review link and canonical
  total.
- Coaching review, including supported historical evidence-limited rows:
  Coaching review ready / Coaching review, with a review link.
- no-reviewable-answer or integrity terminal result: Unable to review / No
  score, with a result link and no performance conclusion.
- incompatible or corrupt `completed` feedback without a valid score: Feedback
  unavailable / Not scored, without a dashboard/history review link.
- missing feedback: Not scored.
- eligible completed scored feedback: exact score and feedback-review link.

The sessions persistence adapter owns the closed presentation discriminator
`scorecard | coaching_review | unable_to_review | unavailable`. Scorecard
presentation requires the exact accepted dimension-coverage provenance,
eligible frozen answer blocks, every weighted dimension score, and the stored
canonical total. Supported historical partial and evidence-limited rows are
strictly revalidated and projected as scoreless `coaching_review`; their stored
rows are not rewritten. Historical evidence-limited reviewability still requires its
exact accepted provenance, all score columns null, empty drills, bounded
server-owned content, and exact canonical quote/reference support. Scored
historical reviewability requires a supported tuple with complete coherent
scores and valid grounded content. Terminal `unable_to_review` requires the
closed no-reviewable or integrity outcome/tier facts; a generic skipped row does
not qualify. The bounded adapter reuses the canonical completed presenter after
one capped evidence read, so Dashboard cannot label a completed review reachable
when the destination route rejects it. A score, null score, status, or raw
provider/version field alone is never enough.

Overview and History may link every valid customer outcome and supported
historical review. The latest-feedback action selects the newest reviewable
result; practice
recommendations, score averages, progress bars, focus dimensions, trends, and
weakness patterns continue to use scored feedback only. When a scored pattern
exists, its review action targets scored feedback rather than a newer
scoreless review.

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
- The sessions persistence adapter owns the bounded dashboard reviewability
  discriminator and applies the canonical persisted-content/evidence parser;
  dashboard summaries consume that discriminator rather than raw provider or
  version fields.
- Dashboard summaries and the insights aggregator must use the shared rule.
- `@meelni/test-fixtures` supplies zero, one, many, and every-feedback-status
  regression scenarios.
- Behavior tests must prove that score-ineligible records cannot affect scores,
  progress bars, focus areas, or patterns, while valid coaching/unable outcomes
  remain honestly labeled and invalid/corrupt completed rows do not become
  reachable.

`session_history_viewed.has_feedback` reports only whether at least one
reviewable link is present. It includes valid scoreless reviews without adding
session identifiers, findings, transcript content, or provider fields.

This contract implements the accepted live PM interview practice positioning.
Calibrated readiness or fit claims remain out of scope until a separately
accepted evidence and calibration gate exists.
