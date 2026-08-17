# Feedback quality signals delta

> SAV-453 amendment: the active mutation contract is v2 and consumes only the
> closed `scorecard | coaching_review` customer outcome.

## Eligibility

- The server SHALL derive review outcome from the strict completed-feedback
  presenter and SHALL NOT accept outcome from the client.
- Only Scorecard and Coaching review SHALL accept a quality signal.
- Unable, historical, unavailable, malformed, missing, and cross-owner reviews
  SHALL create no signal and SHALL be non-enumerating.

## Closed mutation

- V2 SHALL accept only `helpful | not_helpful` and the documented compatible
  closed reason enum; it SHALL accept no free text or unknown field.
- The evaluator feedback row SHALL remain immutable.
- One owner/review row SHALL be enforced by the database.
- Exact retries SHALL be state and analytics no-ops. Intentional updates SHALL
  require the current revision. Divergent stale updates SHALL conflict.
- Authentication, same-origin JSON, bounded-body, ownership, deletion fencing,
  and durable per-owner rate limiting SHALL precede sensitive mutation.

## Privacy lifecycle

- Account export SHALL include only the explicit current signal projection and
  SHALL exclude operational rate state.
- Account deletion SHALL remove signal/rate rows and SHALL prevent late
  recreation after a tombstone wins.
- Optional provider analytics SHALL require current explicit consent and SHALL
  contain no raw/pseudonymous resource IDs, scores, interview content, feedback
  content, provider output, URL, or arbitrary token.

## Metrics

- Current-state helpfulness metrics SHALL use first-party signal rows.
- Outcome/reason reporting SHALL require at least ten distinct users in every
  observed cell and SHALL suppress the entire outcome when a complementary
  cell is below threshold.
- Provider telemetry and all-user first-party metrics SHALL use separate
  denominators.

## Presentation

- The control SHALL follow actionable review content and precede the optional
  transcript.
- It SHALL hydrate the current response, expose semantic keyboard controls and
  non-color state, retain retryable input, announce saved/error state
  appropriately, prevent double submission, and avoid overflow at 320px,
  390px, and desktop widths.
