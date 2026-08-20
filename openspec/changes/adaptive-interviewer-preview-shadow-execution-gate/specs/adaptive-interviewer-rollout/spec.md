# Adaptive Interviewer Rollout Delta

## ADDED Requirements

### Requirement: Preview shadow uses fresh exact one-time authority

The system SHALL accept Preview-shadow execution only from a closed
domain-separated authorization bound to exact candidate SHA, full config
digest, selected candidate, environment, stage, cohort, owner values, rehearsal
matrix, external reference, time window, and one-time nonce. Missing, extra,
duplicate, malformed, expired, not-yet-valid, drifted, or replayed input SHALL
fail closed. Preparation and Production/default-on validators SHALL reject it.

#### Scenario: Broad or prior approval is reused

- **WHEN** an approval lacks the exact merged SHA, digest, nonce, or current
  decision/expiry
- **THEN** no Preview adapter is constructed and no authorization is consumed

### Requirement: Preview runtime construction is explicit and non-influential

The application SHALL remain all-off with literal `adapter=None`. A future live
entrypoint MAY construct only through an exact config binding, an unexpired
session lease, an injected trusted durable-admission verifier, and an injected
transport factory. Shadow SHALL NOT control speech, controller, transcript,
feedback, customer output, room lifecycle, or flags.

#### Scenario: Ambient provider configuration exists

- **WHEN** no explicit valid live-stage inputs are injected
- **THEN** the factory returns typed `disabled|unavailable` with no adapter and
  without reading environment state

### Requirement: Every attempt has conservative spend truth

The durable control-plane ledger SHALL allocate a bounded session lease before
room/worker construction and include outstanding leases in overall and hard-
stop caps. The local lease ledger SHALL reserve before transport. Failure,
timeout, cancellation, invalid response, and ambiguous outcomes SHALL retain
the full attempt reservation. Trusted larger billing SHALL reconcile upward
and stop rather than be clipped. Sanitized receipts SHALL reconcile centrally
and idempotently outside the speech path.

#### Scenario: Transport times out after possible provider acceptance

- **WHEN** no trustworthy usage is returned
- **THEN** the attempt reconciles at the full reservation and remains attributed
  only by sanitized ordinal/state evidence

### Requirement: Provider-free lifecycle rehearsal preserves authorities

The harness SHALL cover startup, success, failure, timeout, cancellation,
stale/version mismatch, replay, kill-switch new-session all-off, and bounded
in-flight settle/shutdown. It SHALL prove exact no speech influence and
transcript/feedback isolation. Its live 28-cell matrix SHALL remain unperformed.

#### Scenario: Kill switch fires with in-flight work

- **WHEN** new admissions are fenced
- **THEN** the shadow task settles/cancels and adapter closes within 250 ms
- **AND** no speech drain, transcript mutation, feedback call, or customer output
  occurs

#### Scenario: Bounded cleanup cannot be confirmed

- **WHEN** idle wait, cancellation, shutdown, or adapter close cannot be
  confirmed inside the shared absolute deadline
- **THEN** simultaneous settle callers share one stopped result and one
  content-free stop-incomplete incident
- **AND** no terminal session receipt is emitted, the full session reservation
  remains open, and central allocation remains stopped until an authenticated
  worker/process termination acknowledgement
