# Interviewer Benchmark Requirements

## ADDED Requirements

### Requirement: provider-free reproducibility

The system SHALL produce byte-identical current-runtime baseline evidence from
the same source and fixture inputs without credentials or provider calls.

#### Scenario: CI verification

- **WHEN** CI runs the baseline verification command
- **THEN** it validates the checked artifact byte for byte and reports zero
  provider calls and zero actual cost.

### Requirement: representative adaptive sessions

The catalog SHALL contain a complete synthetic session for every PM round and
collectively cover strong, shallow, rambling, contradictory, silent,
interrupting, and time-consuming candidate behavior.

#### Scenario: shallow or adversarial behavior

- **WHEN** a candidate gives low-signal, conflicting, interrupted, or long answers
- **THEN** the judge evaluates whether the interviewer adapts without scoring the candidate.

### Requirement: deterministic policy invariants

The benchmark SHALL fail closed on coaching, mid-session evaluation, multiple
questions, repeated probes, deadline violations, and post-close speech.

#### Scenario: negative control

- **WHEN** one policy violation is injected
- **THEN** the deterministic engine identifies that declared invariant family.

### Requirement: human-owned calibration authority

The benchmark SHALL never label agent-authored examples human-adjudicated.

#### Scenario: missing owner review

- **WHEN** the eight v1 examples have not been accepted or rejected by the product owner
- **THEN** baseline execution remains usable but shadow entry remains ineligible.
