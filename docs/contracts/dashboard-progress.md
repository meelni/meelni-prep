# Dashboard Progress Evidence

The dashboard may summarize PM interview practice only from completed feedback
that contains a valid rubric score. It reports observed practice evidence; it
does not predict interview readiness, hiring outcomes, question fit, or future
improvement.

## Scored Feedback Eligibility

A feedback record contributes to progress only when all conditions are true:

1. The server-owned presentation kind is `scored`, proving a supported scored
   provenance tuple with complete scores.
2. `feedback.status` is exactly `completed`.
3. `feedback.overallScore` is a finite number from 0 through 10.

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

## Feedback Reviewability And State Labels

- `pending` or `processing`: Feedback pending / Pending / Processing.
- `failed`: Feedback failed / Unavailable.
- `skipped`: Feedback skipped / Skipped.
- valid completed evidence-limited feedback: Feedback ready — no score / No score,
  with a feedback-review link.
- incompatible or corrupt `completed` feedback without a valid score: Feedback
  unavailable / Not scored, without a dashboard/history review link.
- missing feedback: Not scored.
- eligible completed scored feedback: exact score and feedback-review link.

The sessions persistence adapter owns a closed presentation discriminator:
`scored`, `evidence_limited`, or `unavailable`. Evidence-limited reviewability
requires the exact accepted provenance tuple and completion facts, all score
columns null, empty drills, bounded JSON, server-owned closed-template content,
and exact persisted quote/reference support in canonical user evidence. Scored
reviewability requires either the exact supported v2 provenance tuple with
complete, coherent scores, valid findings and practice suggestions, and exact
persisted quote/reference support, or the exact supported legacy tuple with
complete in-range historical scores and valid historical findings and practice
suggestions. The bounded sessions adapter reuses the canonical completed
feedback parser after one capped page-level evidence read, so it cannot label a
row reviewable when the destination route would reject its stored content. The
API does not expose the version tuple, findings, summary, model identity, or
transcript references. A score, null score, or `completed` status alone is never
enough.

Overview and History may link both scored and valid evidence-limited reviews.
The latest-feedback action selects the newest reviewable result; practice
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
  progress bars, focus areas, or patterns, while valid evidence-limited reviews
  remain linked and invalid/corrupt completed rows do not.

`session_history_viewed.has_feedback` reports only whether at least one
reviewable link is present. It includes valid scoreless reviews without adding
session identifiers, findings, transcript content, or provider fields.

This contract implements the accepted live PM interview practice positioning.
Calibrated readiness or fit claims remain out of scope until a separately
accepted evidence and calibration gate exists.
