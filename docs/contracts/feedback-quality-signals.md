# Feedback Quality Signals

Status: `feedback-quality-signal.v2`

## Purpose

Feedback quality is separate first-party product data that records whether an
owner found one actionable review helpful. It is not evaluator output,
interview-performance evidence, a score override, or authorization to
regenerate feedback.

Immutable transcript events remain the integrity source. Derived answer blocks
remain the evaluation and presentation unit. SAV-420's strict presenter is the
only eligibility authority, so equivalent transcript segmentation cannot
change quality-signal eligibility or its server-derived outcome.

## Eligibility

Valid dimension-coverage Scorecards and Coaching reviews are eligible. The
supported historical partial or evidence-limited presentation is a scoreless
Coaching review. Unable, missing, pending, failed, skipped, corrupt,
unsupported, historical v1, and historical scored v2 rows are ineligible and
receive the same non-enumerating absence behavior.

## Closed v2 values

Response is `helpful | not_helpful`. Helpful requires a null reason. Not
helpful permits null or one closed compatible reason:

- `not_specific_enough`
- `evidence_did_not_match`
- `next_step_unclear`
- `too_much_to_use`
- `score_explanation_unclear` for Scorecard only
- `score_withholding_unclear` for Coaching only

No free-text, other, comment, details, or metadata field exists. Contract
expansion requires a new version and migration.

## API and concurrency

The dynamic no-store owner API is
`GET|PUT /api/feedback/:sessionId/quality-signal`. GET returns the
server-derived outcome and current signal or null. PUT accepts exactly:

```json
{
  "contractVersion": "feedback-quality-signal.v2",
  "response": "helpful",
  "reason": null,
  "expectedRevision": null
}
```

Null revision creates only. Exact replay is unchanged. A changed current
revision increments once. A stale divergent mutation returns HTTP 409 with the
authoritative owner-safe state. Responses expose no resource identity, score,
content, provider value, or parser detail.

Authentication occurs before body parsing. PUT requires same-origin
`application/json`, a 1 KiB body bound, and one of 20 durable owner attempts in
the preceding hour. The budget is consumed before target lookup to avoid an
ownership oracle. Missing/cross-owner/ineligible/corrupt sources are identical
404 responses. A durable deletion tombstone short-circuits limiter persistence,
so a late authenticated request cannot recreate operational rate state after
account cleanup.

## Persistence and account privacy

`feedback_quality_signal` is separate from immutable `feedback` and binds
owner, session, and feedback with database ownership constraints. Reads are
deletion-aware and owner scoped through the no-store API; authenticated roles
have no direct table grant. Writes are server owned. Mutations share the
account-identity lock and tombstone barrier. Account export includes only the
closed current signal fields. Account deletion explicitly removes signal and
rate rows before the feedback/session graph.

Historical v1 rows remain immutable. Reads normalize `full_scorecard` to
`scorecard` and `partial_scorecard` to scoreless `coaching_review`. A v1
partial-scorecard `score_explanation_unclear` reason is omitted from the v2
owner-safe view because score-only reasons cannot cross the coaching boundary;
the persisted row is neither rewritten nor renormalized.

## Analytics

Optional events contain only closed outcome/response/reason/action fields:

- `feedback_viewed`
- `feedback_helpfulness_responded`
- `feedback_practice_started`

They never include resource identifiers, score, transcript/question/evidence,
feedback text, provider output, errors, URLs, or free text. View delivery is
once per mounted actionable review under already-accepted resolved consent.
Helpfulness delivery follows only a durable created/updated transition.
Practice-start delivery follows only a durable newly created SAV-418 attempt.
Provider failure is nonfatal.

Provider events describe consented behavior and are not a current-state
helpfulness source. First-party rows own that metric.

## Privacy-threshold aggregation

The minimum cell cohort is ten distinct users. Cells are partitioned by
server-derived outcome, response, and closed reason (including explicit
`not_provided`). Multiple reviews from one user count once toward thresholding.
If any observed cell within an outcome is below ten users, the entire outcome
is suppressed, including totals, so subtraction cannot reveal the small cell.
Published aggregates contain counts only and no raw or pseudonymous rows.

## UI

The control appears after the actionable review/focused-practice content and
before the optional transcript. It uses a named semantic group, 44px controls,
visible focus, explicit Not-helpful reason submission/skip, hydration,
pending/saved/conflict/retry states, and responsive stacking without overflow.

All code, docs, tests, PRs, and issue evidence use synthetic fixtures only.
