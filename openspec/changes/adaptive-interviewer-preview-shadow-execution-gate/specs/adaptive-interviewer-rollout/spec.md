# Adaptive Interviewer Rollout Delta

## ADDED Requirements

### Requirement: Preview shadow uses fresh exact one-time authority

The system SHALL accept Preview-shadow execution only from a closed
domain-separated authorization bound to exact candidate SHA, full config
digest, selected candidate, environment, stage, cohort, owner values, rehearsal
matrix, external reference, time window, and one-time nonce. Missing, extra,
duplicate, malformed, expired, not-yet-valid, drifted, or replayed input SHALL
fail closed. Authorization JSON SHALL reject more than 64 KiB UTF-8 or nesting
deeper than 32 before unbounded traversal. Preparation and Production/default-
on validators SHALL reject it.
At activation/CAS time, independently trusted bindings SHALL supply the exact
deployed/reviewed SHA, config/selection digests, target, and current time. An
injected authenticated owner-decision verifier SHALL return a fresh opaque
result bound to the authorization digest, external reference, decision/expiry,
and nonce. Self-binding or a plain boolean SHALL fail closed.

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

One session's observed evidence SHALL be bounded by the explicit 250b nano-USD
sanity ceiling, while aggregate accounting SHALL use the exact safe 25x ceiling
so every already-admitted session can still reconcile after a stop. The
aggregate sanity ceiling SHALL NOT authorize new allocation above the 10b/25b
execution caps.

Session receipt and stop-incomplete IDs SHALL be treated as integrity and
idempotency digests only. The future durable adapter SHALL authenticate worker
provenance and the reconciliation channel before accepting them. Incident
spend above the full retained lease SHALL be accounted immediately as exact
excess and a future termination acknowledgement SHALL not double count it.

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
