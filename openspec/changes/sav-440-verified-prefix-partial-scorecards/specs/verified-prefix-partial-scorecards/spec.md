# Verified-prefix partial scorecards

## ADDED Requirements

### Requirement: Partial numerical evidence is trusted-prefix-only

For a partial frozen snapshot, the system MUST send only SAV-441 trusted closed
answer blocks to numerical evaluation. Any missing, empty, or failed trusted
projection MUST produce no provider evaluation and no numerical feedback.

#### Scenario: Terminal tail is excluded

- **WHEN** an earlier answer is independently closed and the terminal tail is
  excluded by a valid verified-prefix projection
- **THEN** only the earlier trusted block is available to the evaluator

### Requirement: Partial scorecards are sparse and never overall-scored

The system MUST persist and present scores only for sufficiently supported
dimensions and MUST persist/present a null overall score for every verified-
prefix partial snapshot.

#### Scenario: Every dimension happens to be sufficiently supported

- **WHEN** a partial verified prefix supports all configured dimensions
- **THEN** the dimension scores MAY be shown but the overall score remains null

### Requirement: New rows are projection-bound and fail closed

Every v2 verified-prefix result MUST persist a versioned server-owned binding
to its exact ordered trusted-block projection. Authenticated and dashboard reads
MUST recompute and compare that binding before exposing feedback.

#### Scenario: Scope identity is forged

- **WHEN** a v2 row contains a missing, extra, reordered, or altered trusted
  identity or an inconsistent sparse score
- **THEN** the row is unavailable and exposes no scores

### Requirement: Historical feedback is immutable and readable

The v2 contract and migration MUST be additive. Existing legacy, Feedback v2,
evidence-limited, and dimension-coverage v1 rows MUST retain their prior read
and analytics behavior without rewrite.

### Requirement: Presentation explains verified scope safely

The partial scorecard UI MUST explain in visible, candidate-safe language that
only verified completed answers were scored and the excluded tail did not lower
the shown scores. Partial scorecards MUST remain excluded from overall progress,
trend, and insight claims.
