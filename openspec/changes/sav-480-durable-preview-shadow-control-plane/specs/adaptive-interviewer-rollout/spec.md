# Adaptive Interviewer Rollout Delta

## ADDED Requirements

### Requirement: Preview-shadow activation is authenticated and globally one-time

The system SHALL verify a fresh domain-separated Ed25519 owner-decision
artifact against an explicit versioned key registry and independently supplied
candidate SHA, Preview configuration digest, selected-candidate digest, stage,
environment, cohort, exposure, and current time. Parsing SHALL reject duplicate
keys, inputs over 64 KiB UTF-8, nesting over depth 32, missing or extra fields,
accessors, unsafe integers, noncanonical timestamps, and signature or key-window
drift. The durable database SHALL consume authorization ID, nonce, decision
reference, and artifact digest exactly once using database time at the CAS.

#### Scenario: Activation acknowledgement is lost

- **WHEN** the exact signed request is retried after the database committed
- **THEN** the system returns the same run and activation evidence
- **AND** a request with any divergent binding or capability conflicts without
  creating another run

### Requirement: Session allocation precedes LiveKit construction

The system SHALL lock the run and atomically allocate one closed session lease
before any LiveKit room, dispatch, token, worker, or provider construction. It
SHALL count reconciled spend, open reservations, and incomplete-stop excess
against both allocation caps; stopped, expired, stale-revision, wrong-cohort,
or cap-exceeding requests SHALL fail closed.

#### Scenario: Two processes race for the same or final lease

- **WHEN** concurrent transactions allocate the same binding or contend at a
  remaining cap boundary
- **THEN** exact same-binding retry converges to one lease
- **AND** no more than the allowed unique allocation commits

### Requirement: Reconciliation is authenticated, idempotent, and conservative

The system SHALL accept worker terminal receipts and stop-incomplete incidents
only with the exact lease's worker channel capability, cohort stop events only
with the run control capability, and termination acknowledgements only with the
exact lease's termination capability. Only domain-separated capability hashes
SHALL persist. Exact replay SHALL be idempotent; divergent, cross-run, or cross-
lease, or expected-revision replay SHALL conflict. Run-control, worker, and
termination capabilities SHALL be pairwise distinct within the run. Raw
content, identities, payloads, provider IDs,
signatures, capabilities, and errors SHALL NOT persist as evidence.

#### Scenario: Cleanup cannot be confirmed and the process later terminates

- **WHEN** an authenticated stop-incomplete incident records conservative
  spend and a later authenticated termination acknowledgement arrives
- **THEN** the run remains stopped
- **AND** the full retained reservation and prior incident excess are
  atomically replaced with final spend without clipping or double counting

### Requirement: Durable state survives retry, crash, and restart

The system SHALL derive authoritative state from PostgreSQL rather than process
memory. Every mutation SHALL hold the run row lock, use database clock, preserve
contiguous revisions, and validate relational counts/totals before commit.

#### Scenario: The server restarts between commit and response

- **WHEN** a new process retries an activation, allocation, receipt, incident,
  stop event, or termination acknowledgement
- **THEN** it observes the committed exact result or a content-free conflict
- **AND** no counter, reservation, spend, or revision is applied twice

### Requirement: Durable authority remains unwired and non-influential

The implementation SHALL expose no app route, package public entrypoint, voice-
runtime import, provider factory, environment lookup, flag mutation, room call,
Preview influence, Production/default-on action, or GO/NO-GO decision.

#### Scenario: Repository behavior is exercised provider-free

- **WHEN** focused and database tests construct the durable service explicitly
- **THEN** application `adapter=None` and all existing runtime authorities are
  unchanged
