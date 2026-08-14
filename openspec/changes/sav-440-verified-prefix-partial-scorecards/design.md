# Design: Verified-prefix partial scorecards

## Contract selection

Existing `feedback.dimension-coverage.v1` rows and complete-session writes keep
their exact behavior. A new `feedback.dimension-coverage.v2` result is selected
only when a partial frozen snapshot reproduces a SAV-441 projection with status
`verified_prefix` and at least one trusted block.

The provider continues to return the closed dimension-selection contract. Core
receives only the projection's trusted blocks and adds a server-owned
`feedback.verified-prefix-scope.v1` value after parsing. The scope contains the
SAV-441 projection version, the ordered trusted identities, and the number of
excluded tail blocks. It contains no transcript text or provider metadata.

## Numerical policy

Only v2 trusted-prefix blocks can support numerical scores on a partial frozen
snapshot. A dimension receives a score only when both configured facets cite a
trusted block. Unsupported dimensions remain null. A verified-prefix result is
always `partial` and its overall score is always null, including the defensive
case where the provider finds sufficient evidence for every dimension.

Partial completion records retain the durable `evidence_limited_only`
constraint because it remains the safe default when authority is absent. An
exact server-recomputed `verified_prefix` projection supersedes that legacy
constraint only for the current invocation and only for the projected trusted
blocks. Without that projection the same completion record remains scoreless.

When no dimension is sufficiently supported, the same v2 scope produces a
scoreless coaching review. A partial snapshot with no trusted blocks or any
authority/integrity failure follows the existing unable-to-review path without
provider work.

## Persistence and reads

Migration 0038 adds a nullable JSONB verified-prefix scope and extends the
closed feedback version constraints additively. V2 completed rows require the
scope; non-v2 rows require it to remain null. Existing rows are not rewritten.

Authenticated and dashboard readers reload frozen evidence, recompute the
trusted projection, and require an exact canonical match between the persisted
scope and the recomputed ordered identities/exclusion count. Sparse scalar
scores must also match the reconstructed dimension result. Missing, forged,
oversized, or inconsistent v2 data renders unavailable.

## Presentation and analytics

The partial scorecard and coaching surfaces state that the review uses only
verified completed answers and that the unfinished/unverified tail stayed
outside the review without being treated as negative evidence. They state that
only verified completed answers could support the scores or coaching shown,
without claiming that exclusion had no effect on evidence availability. The
explanation is visible text and does not depend on color. Historical v1
partial/coaching reviews keep a null scope and do not receive this new claim.

History keeps the review reachable, exposes only validated sparse dimension
scores, and never presents an overall score. Existing progress, trend, and
insight aggregators continue to admit only valid overall-scored rows, so v2
partial scorecards cannot change numerical progress claims.

## Compatibility and calibration

V1, evidence-limited, Feedback v2, and legacy rows remain immutable and
readable under their existing contracts. Provider-free regression fixtures
cover full, verified-prefix partial, coaching, unable, corrupted scope,
segmentation/replay stability, migration shape, history/insights, UI,
accessibility, and browser behavior.
