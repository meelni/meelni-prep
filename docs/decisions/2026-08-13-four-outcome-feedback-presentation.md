# Four-Outcome Feedback Presentation

Status: accepted

Date: 2026-08-13

## Decision

Meelni presents terminal feedback as Full scorecard, Partial scorecard,
Coaching review, or Unable to review. The presentation consumes the accepted
answer-block and dimension-coverage contracts; it does not create a second
scoring classifier.

Full scorecards show the supported complete result. Partial scorecards show
only supported dimension scores, label unsupported dimensions `Not enough
evidence`, and never show an overall. Coaching reviews show grounded signals,
visible exact-citation support semantics, and one prioritized focus without
scores. Unable states create no coaching or performance conclusion.

Rubric coverage and verified-evidence integrity remain different reason
families. Integrity failure is system-owned, explicitly does not reflect
candidate performance, and shows first-party credit recovery truth. Customer
payloads and UI hide model, schema, prompt, rubric, facet, answer-block,
provider, parser, settlement, and integrity codes.

History and Dashboard use the four outcome labels. Existing numeric progress
continues to require a valid overall score, so partial, coaching, unable, and
malformed results cannot pollute trends or weakness claims.

## Consequences

- Presentation remains invariant to equivalent transcript segmentation because
  it consumes derived answer blocks and server-derived coverage.
- Historical supported formats remain readable with explicit compatibility
  treatment; malformed rows fail closed.
- Exact citations retain opaque transcript navigation without leaking internal
  evaluation identifiers.
- Terminal immutable integrity failures do not invent a retry action; transient
  dispatch/generation retry remains separately modeled.
- SAV-418 retains focused-practice persistence ownership and SAV-415 retains
  helpfulness storage and instrumentation ownership.
- All fixtures are synthetic. This decision authorizes no Production, provider,
  deployment, migration, launch, or merge action.
