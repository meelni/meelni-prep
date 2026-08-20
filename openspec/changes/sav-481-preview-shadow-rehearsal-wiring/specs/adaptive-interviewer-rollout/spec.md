# Adaptive Interviewer Rollout Delta

## Requirement: allocation precedes LiveKit construction

The system SHALL provide a dedicated rehearsal workflow that completes durable
lease allocation before any room or agent-dispatch provider call.

### Scenario: executable lease

- GIVEN an exact current run revision and stable session binding/capabilities
- WHEN durable allocation returns `allocated` or executable `replayed`
- THEN the workflow MAY construct one room with exact private job metadata.

### Scenario: closed or failed admission

- GIVEN a closed, revoked, expired, stale, denied, conflicting, or unavailable
  admission
- WHEN the workflow evaluates the result
- THEN it SHALL make zero room or dispatch provider calls.

## Requirement: worker metadata is private and exact

The system SHALL carry the lease and worker-evidence capability only in bounded
LiveKit job metadata and SHALL reconcile byte-identical metadata on retry.

### Scenario: ordinary interview

- GIVEN any existing ordinary interview start
- WHEN no Preview job metadata is supplied
- THEN room creation and dispatch reconciliation SHALL preserve existing
  behavior and no Preview bootstrap SHALL run.

## Requirement: runtime construction remains injected and shadow-only

The system SHALL require explicit durable-admission and provider-transport
dependencies before constructing the lease-bounded Python runtime.

### Scenario: dependency absent

- GIVEN missing verifier, transport, valid lease, or open kill switch
- WHEN bootstrap is attempted
- THEN it SHALL return disabled/unavailable without provider construction.

## Requirement: merge grants no live authority

The repository slice SHALL NOT authorize provider access, spend, deployment,
rooms, Preview influence, Production/default-on, launch, or live matrix claims.
