# Total-required feedback scorecards

## ADDED Requirements

### Requirement: Every customer scorecard is complete

The system MUST label a customer result Scorecard only when every weighted PM
dimension has a valid score and the canonical weighted overall is present and
matches those scores. The system MUST NOT renormalize supported dimensions,
zero-fill missing dimensions, extrapolate an excluded tail, or use transcript
length or grammar to manufacture the total.

#### Scenario: Incomplete weighted coverage

- **WHEN** any weighted dimension has less than sufficient grounded coverage
- **THEN** the customer outcome is Coaching review with no dimension or overall
  score fields

### Requirement: Exact safe markers do not suppress complete authority

The exact content-free `interviewer/no_provider_confirmed_prefix` marker MUST be
transparent to prompt/answer continuity and MUST NOT, by itself, suppress
total-score authority.

#### Scenario: Repeated safe markers with complete trusted scope

- **WHEN** a healthy settled gap-free frozen authority contains repeated exact
  safe interviewer markers, its trusted projection covers every candidate
  answer block with zero excluded tail blocks, and every dimension is
  sufficient
- **THEN** the result is Scorecard with all dimension scores and the canonical
  overall

#### Scenario: Equivalent no-marker segmentation

- **WHEN** no-marker and repeated-marker inputs have identical trusted candidate
  scope
- **THEN** they produce identical scores, overall, citations, and customer
  outcome

### Requirement: Excluded candidate evidence is scoreless coaching

- **WHEN** a trusted projection excludes any real candidate tail block
- **THEN** the customer outcome is Coaching review and no dimension or overall
  score crosses the customer boundary

### Requirement: Integrity failure remains strict

Candidate markers, canonicalization failures, replay conflicts, sequence gaps,
writer/cutoff conflicts, corrupt persistence, and no-reviewable-answer states
MUST fail closed as Unable to review or the existing unavailable lifecycle as
appropriate. They MUST NOT be coerced to Coaching review.

### Requirement: Consumers use one closed projection

Core MUST export one discriminated `scorecard | coaching_review |
unable_to_review` projection. Feedback, Dashboard/History, comparison, quality
signals, analytics, fixtures, and local tooling MUST consume that projection
and MUST NOT infer an outcome from nullable score fields.

### Requirement: Historical rows remain immutable

Supported historical partial-scorecard rows MUST remain stored without rewrite.
The read boundary MUST strictly validate their original versioned tuple and
project them as scoreless Coaching review. Unknown or incoherent variants MUST
remain unavailable.
