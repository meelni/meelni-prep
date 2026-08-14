# Feedback stage-attempt history delta

## Requirement: durable history cannot become product authority

The service SHALL buffer content-free attempt evidence while feedback executes
and SHALL invoke one bounded batch flush only after the authoritative workflow
outcome is determined. Recorder rejection, synchronous throw, divergent replay,
or non-resolution MUST NOT change evaluation, feedback persistence, retry, or
terminal state.

### Scenario: recorder does not settle

Given the product workflow completes and the attempt recorder never resolves,
the workflow MUST return the same product result after only the documented
post-outcome bound, and the 90-second generation deadline MUST remain unchanged.
The system MUST NOT claim that a still-pending write completes after a
terminating serverless invocation ends.

## Requirement: exact generation-event fencing is identity-free at rest

The recorder SHALL compare the transient raw dispatch event against the locked
feedback row before persisting only a versioned SHA-256 fence. The stored row
MUST NOT contain the raw event, its embedded session identifier, or a provider
request identifier.

### Scenario: stale generation replay

Given a delayed workflow carries an event other than the feedback row's current
event, the batch SHALL be fenced before any attempt row is inserted.

## Requirement: exact attempts are closed and immutable

The system SHALL accept only closed operation/stage, outcome/failure,
workflow/provider attempt, timing, environment, and provider-context tuples.
The workflow attempt SHALL equal the zero-indexed Inngest attempt plus one;
provider attempt SHALL remain a separate one-through-three ordinal.

### Scenario: exact and divergent replay

Given an existing logical attempt row, an exact match of every normalized
persisted field SHALL be an idempotent duplicate. The same logical key with any
different outcome, failure, timing, budget, environment, or provider field
MUST fail closed as a conflict.

### Scenario: contradictory timing

Given a duration that does not exactly equal completed timestamp minus started
timestamp, or a duration bucket outside that duration's range, normalization
and the database SHALL reject the row.

### Scenario: provider metadata on a non-provider operation

Given a non-provider operation carries a provider diagnostic, status, model,
tier, usage, or Retry-After value, normalization and the database SHALL reject
the row. Provider operations MAY carry only the documented compatible fields.

## Requirement: service-only privacy lifecycle

The additive table SHALL force RLS, deny public and authenticated access, and
contain no user, session, room, question, transcript, answer, evidence,
feedback-content, raw-error, provider-payload, or provider-request columns.
Account erasure SHALL delete attempt rows before their feedback/session parents
and SHALL prevent late recreation through the same lock ordering.

### Scenario: production-shaped provider-free fixture

Given a synthetic dispatch event containing a session UUID, the stored row and
SQL projection MUST contain neither that UUID nor the raw event, while exact
replay and account erasure continue to succeed.
