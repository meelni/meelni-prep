# Verified-prefix partial scorecards

> Superseded in customer outcome policy by SAV-453. The trusted-prefix and
> immutable-scope requirements remain; sparse customer scorecards do not.

## ADDED Requirements

### Requirement: Partial numerical evidence is trusted-prefix-only

For a partial frozen snapshot, the system MUST send only SAV-441 trusted closed
answer blocks to numerical evaluation. Any missing, empty, or failed trusted
projection MUST produce no provider evaluation and no numerical feedback.

#### Scenario: Terminal tail is excluded

- **WHEN** an earlier answer is independently closed and the terminal tail is
  excluded by a valid verified-prefix projection
- **THEN** only the earlier trusted block is available to the evaluator

#### Scenario: Durable qualitative constraint has verified authority

- **WHEN** a current partial completion record carries
  `feedbackModeConstraint=evidence_limited_only` and the server recomputes an
  exact verified-prefix projection
- **THEN** the projection supersedes that constraint only for its trusted
  blocks and the invocation may produce sparse dimension scores

#### Scenario: Durable qualitative constraint has no verified authority

- **WHEN** the same partial completion record has no valid verified-prefix
  projection
- **THEN** the invocation remains scoreless

### Requirement: Verified-prefix results are complete or scoreless

The system MUST present a Scorecard only when the verified-prefix projection
has zero excluded candidate blocks and every weighted dimension is sufficiently
supported. Otherwise it MUST present scoreless Coaching review.

#### Scenario: Every dimension happens to be sufficiently supported

- **WHEN** a partial verified prefix has zero excluded candidate blocks and
  supports all configured dimensions
- **THEN** every dimension score and the canonical overall are present

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

The Coaching review UI MUST explain in visible, candidate-safe language that
the excluded tail was not treated as negative evidence and only verified
completed answers could support the scores or coaching shown. It MUST NOT claim
that excluding unavailable information had no effect on which rubric dimensions
were supportable. Coaching reviews MUST remain excluded from overall progress,
trend, and insight claims.
