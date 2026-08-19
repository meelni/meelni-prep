# Interviewer Benchmark Requirements

## ADDED Requirements

### Requirement: provider-free reproducibility

The system SHALL produce byte-identical current-runtime baseline evidence from
the same source and fixture inputs without credentials or provider calls.

#### Scenario: CI verification

- **WHEN** CI runs the baseline verification command
- **THEN** it validates the checked artifact byte for byte and reports zero
  provider calls, zero actual cost, null token counts, no credential read, and
  no Production call.

#### Scenario: evidence path attack

- **WHEN** a caller supplies an absolute, traversal, unrelated, non-regular, or
  symlink path to the evidence CLI
- **THEN** the command rejects the path without reading or replacing its target.

### Requirement: truthful bounded provider execution evidence

The system SHALL require an exact versioned execution authorization before any
provider-backed judge invocation and SHALL fail closed on malformed or
contradictory result evidence.

#### Scenario: contradictory usage

- **WHEN** a result reports invalid tokens, mismatched model identity, calls or
  cost outside its mode/budget, credential use without authorization, or any
  Production call
- **THEN** the run fails without emitting a successful attestation.

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

#### Scenario: semantic evasion and false-positive control

- **WHEN** advice/praise is paraphrased, a compound question uses one question
  mark, or a repeated probe changes its caller-supplied labels
- **THEN** normalized deterministic checks still reject it while neutral
  framework, recommendation, and single-question turns remain accepted.

### Requirement: human-owned calibration authority

The benchmark SHALL never label agent-authored examples human-adjudicated.

#### Scenario: missing owner review

- **WHEN** the eight v1 examples have not been accepted or rejected by the product owner
- **THEN** baseline execution remains usable but shadow entry remains ineligible.
