# Scoreless focused-practice delta

### Requirement: Honest scoreless eligibility

The system SHALL expose exactly one executable focused-practice path for a
supported Partial scorecard or Coaching review without inventing a numerical
weakness.

#### Scenario: Supported partial or coaching review

- GIVEN a strict SAV-421/SAV-420 read produces a Partial scorecard or Coaching
  review with a grounded practice focus
- WHEN the owner starts focused practice
- THEN the server selects one closed focus identity backed by accepted exact
  evidence
- AND the plan contains no weakest score, unsupported dimension score, overall
  score, readiness claim, or interview-credit claim

#### Scenario: Full or unavailable review

- GIVEN a Full dimension-coverage scorecard, Unable outcome, malformed source,
  corrupt source, or unsupported source
- WHEN focused-practice eligibility is evaluated
- THEN no scoreless attempt is created
- AND historical supported Feedback v2 continues through its existing scored
  focused-practice path

### Requirement: Segmentation-invariant closed selection

The system SHALL derive scoreless practice semantics only from validated
closed identities and the canonical answer-block/evidence boundary.

#### Scenario: Equivalent transcript representations

- GIVEN equivalent candidate speech segmented into different immutable event
  counts or provider findings in a different array order
- WHEN the server selects a scoreless practice focus
- THEN the selected dimension, action, facet or signal, and exercise semantics
  are unchanged
- AND punctuation, surface grammar, answer length, transcript row count, and
  missing scores do not influence selection

### Requirement: Additive strict snapshot compatibility

The system SHALL persist new source semantics in an additive discriminated
plan/attempt/template tuple while retaining strict legacy reads.

#### Scenario: New immutable attempt

- GIVEN an eligible scoreless source
- WHEN an attempt is created
- THEN its internal snapshot freezes the validated feedback tuple, source
  fingerprint, question, round, closed focus identity, exact selected evidence,
  and server-owned template
- AND arbitrary provider-authored exercise copy cannot enter the plan

#### Scenario: Corrupt persisted content

- GIVEN an unknown version, extra key, mismatched identity, mismatched copy,
  mismatched evidence, corrupt lifecycle state, or stale pre-insert source
- WHEN the persisted attempt is parsed or written
- THEN the operation fails closed without creating or rewriting an attempt

#### Scenario: Legacy attempt read

- GIVEN a valid focused-practice v1 row
- WHEN the row is read after the additive migration
- THEN its existing semantics remain readable without reinterpretation

### Requirement: Privacy-safe customer projection

The system SHALL return a separately parsed allow-listed customer view of a
scoreless attempt.

#### Scenario: Customer reads a scoreless attempt

- GIVEN a valid internal v2 attempt containing frozen integrity evidence
- WHEN the API presents the attempt
- THEN the response excludes the internal fingerprint, feedback tuple,
  provider data, closed internal codes, raw transcript and answer-block
  identities, and citation text
- AND it includes only server-owned plan copy, source question, dimension,
  lifecycle state, and the candidate-authored self-review when completed

### Requirement: Owner-scoped idempotent lifecycle

The system SHALL authorize and serialize creation, replay, and completion by
owner and source across supported attempt versions.

#### Scenario: Concurrent or replayed start

- GIVEN an authenticated owner starts focused practice repeatedly or
  concurrently for one source session
- WHEN account-deletion and source ownership checks pass
- THEN all requests converge on one owner/source attempt across contract
  versions
- AND an existing compatible v1 attempt resumes instead of creating a second
  path

#### Scenario: Source changes before insert

- GIVEN the validated source changes between selection and durable creation
- WHEN the repository revalidates the source under its transaction boundary
- THEN fingerprint drift prevents the insert
- AND the response uses a safe unavailable/conflict result

#### Scenario: Source changes after insert

- GIVEN a valid attempt has already been created
- WHEN the source review or question later changes
- THEN retries and revisits return the exact immutable attempt snapshot

#### Scenario: Completion replay

- GIVEN an in-progress attempt is completed once
- WHEN the same completion is replayed
- THEN it succeeds idempotently
- BUT a divergent or concurrent losing completion conflicts without
  overwriting the terminal self-review

#### Scenario: Ownership or deletion fence fails

- GIVEN the requester does not own the source or account deletion is pending
- WHEN a start, read, or completion is attempted
- THEN sensitive state is withheld and no attempt mutation occurs
- AND account export/deletion continues to include/remove the new attempt under
  the existing privacy lifecycle

### Requirement: Executable and accessible return loop

The system SHALL render the scoreless practice workspace as an accessible
completion path and preserve a clear unavailable fallback.

#### Scenario: Complete focused practice

- GIVEN a supported Partial scorecard or Coaching review
- WHEN the owner practices aloud and saves a bounded self-review
- THEN the attempt becomes terminally completed
- AND the page offers a return-to-interview action for the frozen source
  question without automatically starting an interview or consuming credit

#### Scenario: Recovery and responsive presentation

- GIVEN focused practice is permanently unavailable
- WHEN the workspace receives the unavailable response
- THEN it shows a clear fallback without a retry control
- BUT transient transport or service failures retain a retry path
- AND mobile, desktop, and 200% reflow layouts preserve keyboard order, visible
  focus, announcements, labels, 44-pixel targets, wrapping, and no horizontal
  overflow
