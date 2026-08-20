# Stateful Interviewer Contract Delta

## ADDED Requirements

### Requirement: The selected provider adapter is stateless and bounded

The system SHALL implement the exact owner-selected OpenAI Responses candidate
behind the existing `DirectorAdapter`. It SHALL use an injected official SDK
transport with both outer-runner and provider retries disabled and SHALL NOT
read credentials or environment configuration.

#### Scenario: A candidate request is built

- **WHEN** the bounded Director context is normalized for the provider
- **THEN** the request uses the exact model, strict structured output, reasoning
  none, no storage/background/streaming/continuation, and no tools
- **AND** transcript strings are serialized as untrusted data without session,
  writer, affinity, or turn identities

#### Scenario: Retry and failed-attempt spend boundaries fail closed

- **WHEN** the adapter receives a nonzero generic-runner retry limit
- **THEN** it rejects configuration before a transport call
- **AND** normalized successful-response cost is not represented as complete
  provider spend accounting for failed, timed-out, or interrupted attempts

### Requirement: Provider output fails closed at the adapter boundary

The system SHALL accept only one completed exact-model assistant text item with
closed structured output and complete safe usage. It SHALL conservatively round
integer micro-USD cost and enforce all `DirectorLimits` before returning the
provider-neutral result.

#### Scenario: Provider attribution or usage drifts

- **WHEN** status, model, tier, background, continuation, tools, schema, usage,
  reasoning, output, or cost is missing, unsafe, mismatched, or over limit
- **THEN** the adapter rejects it with a content-free bounded failure
- **AND** no provider payload enters controller, transcript, feedback, customer
  output, or telemetry

### Requirement: Candidate presence grants no live authority

The application SHALL continue to inject `adapter=None` and keep every adaptive
flag default off. The preparation authorization SHALL be rejected as rollout-
stage and Production-action authority.

#### Scenario: Repository candidate validation passes

- **WHEN** all provider-free tests and repository gates pass
- **THEN** no provider call, spend, deployment, live room, Preview influence,
  Production/default-on, or launch authority exists
- **AND** SAV-476 still requires a fresh exact-SHA/config live authorization
