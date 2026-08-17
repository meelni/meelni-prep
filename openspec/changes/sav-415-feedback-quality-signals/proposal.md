# SAV-415 feedback quality signals

> Amended by SAV-453. The current quality contract is
> `feedback-quality-signal.v2` and accepts only the closed customer outcomes
> `scorecard | coaching_review`.

## Why

Meelni has no durable first-party answer to whether an actionable feedback
review helped. Adding free text would create a second sensitive content
pipeline, while analytics-only events cannot represent the user's current
response after an update.

## Outcome

An authenticated review owner can create, revisit, and intentionally revise
one closed helpfulness signal for a valid Scorecard or Coaching review. The
signal is stored separately from immutable evaluator
output, participates in account export/deletion, and can be aggregated only
behind minimum-cohort safeguards.

## Boundaries

- The strict SAV-420 completed-review presenter is the eligibility authority.
- The client cannot submit an outcome, review identity, score, evidence, or
  content.
- V2 accepts only closed response/reason enums and no free text.
- The API is owner-authenticated, non-enumerating, no-store, rate bounded, and
  compare-and-swap safe.
- Optional analytics are content-free, explicitly consent-bound, and never the
  source for current-state helpfulness rates.
- The control follows actionable review/focused-practice content and precedes
  the optional transcript.
- No Production, provider, deployment, launch, or merge action is authorized.
