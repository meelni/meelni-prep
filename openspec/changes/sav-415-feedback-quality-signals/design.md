# Design

> SAV-453 amendment: customer eligibility is `scorecard | coaching_review`.
> Supported historical partial rows reduce to scoreless coaching after strict
> source validation; no stored feedback row is rewritten.

## Eligibility and outcome

The database adapter reconstructs the same bounded source aggregate used by
the trusted completed-feedback path. Core presentation must return one of:

- dimension-coverage `scorecard`;
- dimension-coverage `coaching_review`; or
- the supported evidence-limited presentation, mapped to
  `coaching_review`.

Invalid, unavailable, pending, failed, skipped/Unable, historical v1, and
historical scored v2 formats are not rateable. This avoids inventing a modern
coverage outcome for an older row.

## Closed signal

Version `feedback-quality-signal.v2` stores `helpful | not_helpful`.
`helpful` requires a null reason. `not_helpful` permits null or one compatible
reason:

- common: `not_specific_enough`, `evidence_did_not_match`,
  `next_step_unclear`, `too_much_to_use`;
- scorecard only: `score_explanation_unclear`;
- coaching only: `score_withholding_unclear`.

No `other`, comment, details, metadata, or arbitrary text field exists.

## Persistence and concurrency

`feedback_quality_signal` is separate from `feedback` and uniquely binds the
owner, session, and feedback row. Composite foreign keys enforce the same
ownership graph as focused practice. Closed checks mirror the core parser.
Authenticated clients receive owner reads only through the no-store API and
have no direct table grant; writes are server-owned.

PUT accepts exactly `contractVersion`, `response`, `reason`, and
`expectedRevision`:

- null expected revision creates only;
- an exact replay returns `unchanged` without timestamp, revision, or analytics
  movement;
- a changed value with the current revision returns `updated` and increments
  once;
- a stale divergent value returns the authoritative owner-safe signal with
  HTTP 409.

The mutation holds the account-identity lock, locks the account and source,
checks the deletion tombstone, validates the source, and applies the CAS in one
transaction. Deletion-first cannot be followed by recreation; write-first is
erased by deletion.

## Request abuse boundary

Every authenticated PUT consumes one durable rolling-hour owner attempt before
target lookup. The budget is 20 attempts and returns a bounded `Retry-After`.
GET does not consume the budget. Exact replays still consume an API attempt but
do not change product state or emit analytics. The operational rate row is
excluded from export and removed during account deletion. The limiter checks
durable deletion intent before persistence so cleanup cannot be followed by
late operational-state recreation.

## Analytics and aggregation

Allowed events contain only closed fields:

- `feedback_viewed { outcome }` after an actionable review renders;
- `feedback_helpfulness_responded { outcome, response, reason }` after a
  durable created/updated signal transition;
- `feedback_practice_started { outcome, practice_kind }` after SAV-418 returns
  a durable `created` attempt.

No ID, score, content, URL, provider field, or arbitrary token is permitted.
Client views emit once per mounted eligible presentation only when the first
resolved consent state was already accepted; later opt-in is not retroactive.
Server events read trusted current consent and optional delivery failure never
rolls back the first-party mutation.

First-party current-state rows own helpfulness metrics. An outcome is
publishable only when every observed `(response, reason)` cell contains at
least ten distinct users. If one observed cell is below ten, the entire
outcome is suppressed so totals cannot reveal the small complement. Threshold
counts deduplicate users; published response counts may include multiple owned
reviews.

## UI

One `FeedbackQualityControl` appears after focused practice/actionable content
and before the transcript. It hydrates the current state from the separate API.
The named group uses semantic buttons/radios, at least 44px targets, visible
focus, non-color state, explicit submit/skip for Not helpful, polite saved
status, alert/retry errors, pending disablement, and stale-request protection.
It stacks without overflow at 320px and 390px.

## Compatibility and rollback

The migration is additive. Rolling application code back leaves dormant
server-owned rows and does not affect evaluator reads. Dropping the additive
table/function requires an explicit later migration; Production migration is
not part of this task.
