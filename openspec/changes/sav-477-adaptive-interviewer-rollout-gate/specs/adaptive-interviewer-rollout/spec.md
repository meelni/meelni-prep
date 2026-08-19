# Adaptive Interviewer Rollout Requirements

## ADDED Requirements

### Requirement: Forward promotion is adjacent and separately authorized

The system SHALL permit only the next adjacent forward stage. Every forward
transition into Preview or Production SHALL require a target-stage owner
authorization matching the exact candidate Git SHA and configuration SHA-256.

#### Scenario: Authorization is reused for a later stage

- **WHEN** an authorization names a different stage, SHA, or configuration
- **THEN** the transition is rejected as an authorization mismatch

### Requirement: Rollback uses explicit safe targets

Each live stage SHALL define an operational rollback target independently of
progression order. Influence SHALL be revoked first. Production shadow SHALL
roll back to disabled/current Production behavior and SHALL NOT roll back into
Preview influence.

#### Scenario: Production shadow hard stop occurs

- **WHEN** a hard-stop signal is recorded during Production shadow
- **THEN** all adaptive Production flags are revoked to current behavior
- **AND** a transition to Preview influence is rejected

### Requirement: Active-session and new-session stops are distinct

Only Director influence SHALL be represented as immediate active-session
revocation. Shadow, controller, tools, and brief flags SHALL be represented as
new-session construction controls. In-flight Preview shadow provider work SHALL
require the reviewed settle/shutdown path and a rehearsal before live entry.

#### Scenario: Shadow configuration is revoked during an active session

- **WHEN** shadow and dependent flags are removed
- **THEN** new sessions stay on current behavior
- **AND** the gate remains blocked until the existing session's settle/shutdown
  path has terminal evidence

### Requirement: Frozen evidence fails closed

The readiness report SHALL verify the exact SHA-256 of every accepted input
before parsing it. Missing, changed, symlinked, or semantically broadened
evidence SHALL fail generation and verification.

#### Scenario: An accepted fixture changes

- **WHEN** any frozen input bytes no longer match its declared digest
- **THEN** no readiness report or owner request is accepted

### Requirement: Claims remain scoped to actual evidence

The report SHALL identify current-runtime synthetic baseline/invariants,
synthetic feedback fixtures, and observability wire cases separately. It SHALL
NOT infer adaptive quality improvement, live feedback outcomes, or live runtime
metrics from those artifacts.

#### Scenario: Repository verification passes

- **WHEN** all provider-free checks and evidence digests match
- **THEN** the recommendation remains `hold_at_synthetic`
- **AND** owner decision remains `pending`

### Requirement: First owner authority prepares only a candidate

The generated v2 packet SHALL be a pending template with null selections and
digest, no decision reference/time/expiry, and no preparation or transition
authority. The separately owner-completed v1 record SHALL request
`prepare_isolated_preview_shadow_candidate_only`, bind every selected value to
the exact candidate/repository configuration, and MAY authorize repository
implementation/configuration of the selected adapter candidate and provider-
free validation. It SHALL deny provider calls/spend, deployment, live rooms,
Preview influence, Production/default-on, and GO/NO-GO.

The v1 selection SHALL be a closed object containing adapter/provider/model,
integer session and nano-USD caps, explicit synthetic-only privacy/retention
acceptance and bounds, coherent integer bps/ms entry and stop thresholds
including first-audio p50/p95, and fixed non-tunable safety stops. Its domain-
separated selected-candidate digest SHALL bind authority, stages, candidate SHA,
repository configuration, and every normalized selection. Missing, unknown,
duplicate, unsafe, incoherent, stale, expired, or mismatched input SHALL fail
closed. Parsing SHALL NOT claim to authenticate the human; a trusted boundary
must verify the external decision reference.

#### Scenario: A generated template is presented as approval

- **WHEN** the v2 template still has null selections or pending decision fields
- **THEN** it is rejected as preparation authorization
- **AND** it is rejected as rollout-stage and Production-action authorization

#### Scenario: A selected value changes

- **WHEN** any adapter, limit, privacy, retention, threshold, candidate, or
  repository configuration value changes
- **THEN** the selected-candidate digest changes
- **AND** a prior authorization fails exact binding

#### Scenario: Preview shadow is ready to run

- **WHEN** the selected adapter candidate has been reviewed and merged
- **THEN** SAV-476 still requires a second exact-SHA/config owner authorization
  before deployment, provider calls, spend, or live rooms
- **AND** the all-round/adverse-voice rehearsal matrix remains separately bound
  and rehearsed at that live gate
