## ADDED Requirements

### Requirement: Top-Level Room Metadata Remains Version 1

The system SHALL carry `InterviewBriefV2` only as an optional independently
versioned nested field of top-level room-metadata version 1.

#### Scenario: Old writer reaches a new reader

- **WHEN** valid room-metadata v1 contains no nested brief
- **THEN** the reader uses the current prompt-led full-interview path
- **AND** preserves the canonical deadline, hints-off, end-only feedback, and
  selected question

#### Scenario: New writer reaches an old reader

- **WHEN** room-metadata v1 contains an unknown optional `interview_brief` key
- **THEN** the old reader ignores that key
- **AND** continues its v1 behavior

#### Scenario: Nested brief cannot be trusted

- **WHEN** the nested brief is absent, unknown, malformed, digest-invalid, or
  inconsistent with authoritative v1 fields
- **THEN** the new reader discards the brief
- **AND** uses validated v1 behavior without weakening policy

#### Scenario: Top-level version 2 arrives

- **WHEN** current readers receive top-level room-metadata version 2
- **THEN** runtime start fails as an unsupported contract

### Requirement: Brief Compilation Is Deterministic And Replay-Stable

The system SHALL derive brief identity from a canonical payload bound to stable
session-start state and SHALL reuse the accepted bytes and digest on replay.

#### Scenario: Same start state is replayed

- **WHEN** the same accepted session-start fingerprint and ordered contract
  inputs are compiled again
- **THEN** canonical payload bytes, digest, and brief ID are identical

#### Scenario: Object key order changes

- **WHEN** semantically identical input objects arrive with a different key
  order
- **THEN** canonical payload bytes and digest remain identical

#### Scenario: Payload content changes

- **WHEN** any canonical brief field changes
- **THEN** the digest and derived brief ID change

### Requirement: Existing Durable Authorities Remain Primary

The system SHALL keep controller and Director state subordinate to existing
lifecycle, deadline, transcript, settlement, answer-block, and feedback
contracts.

#### Scenario: Runtime phase differs from transcript section

- **WHEN** the controller advances `controller_phase`
- **THEN** it does not rewrite or reinterpret canonical transcript `section`
  semantics

#### Scenario: Generated speech is not delivered

- **WHEN** a move is recommended, admitted, generated, scheduled, spoken, or
  interrupted without canonical transcript evidence
- **THEN** it is not committed as delivered history or feedback evidence

#### Scenario: Canonical delivery arrives

- **WHEN** a durable transcript-v2 event binds the move to writer generation,
  sequence, and delivered or partially-delivered evidence
- **THEN** the controller may mark it `canonically_delivered`

### Requirement: Move Admission Is CAS-Protected And Idempotent

The system SHALL bind mutating decisions to session, writer generation, state
revision, freshness, and an idempotency key.

#### Scenario: Exact mutation is retried

- **WHEN** the same idempotency key and canonical request bytes are replayed
- **THEN** the original result is returned as `duplicate`
- **AND** state does not advance again

#### Scenario: Key is reused for a different request

- **WHEN** an idempotency key is reused with different canonical request bytes
- **THEN** the request fails as `idempotency_conflict`

#### Scenario: State or writer is stale

- **WHEN** the expected state revision or writer generation is not current
- **THEN** the request fails without mutation

#### Scenario: Exact expiry boundary is reached

- **WHEN** current time equals the accepted expiry timestamp
- **THEN** the move or recommendation remains eligible
- **AND WHEN** current time is one millisecond later
- **THEN** it is expired

### Requirement: Tools Are Bounded And Non-Privileged

The system SHALL expose only the accepted five session-local tools and SHALL
fall back immediately on deadline or failure.

#### Scenario: Tool is not allowlisted

- **WHEN** the live model requests any other capability
- **THEN** schema validation rejects the request

#### Scenario: Tool fails or misses its deadline

- **WHEN** a tool is unavailable, invalid, stale, closed, expired, or timed out
- **THEN** the live response uses the current deterministic/prompt-led fallback
- **AND** speech, transcript persistence, exit, and settlement do not wait

#### Scenario: Tool requests privileged data or mutation

- **WHEN** a request attempts database, billing, account, feedback, secret,
  provider-admin, deployment, Production, or lifecycle access
- **THEN** no accepted schema or adapter exists for that capability

### Requirement: Director Advice Never Owns Live Behavior

The system SHALL treat `DirectorRecommendation` as bounded asynchronous advice
that the controller may reject and the live interviewer never awaits.

#### Scenario: Recommendation is fresh and valid

- **WHEN** session, brief, writer, state, finalized source turn, freshness, and
  allowed-move policy all match
- **THEN** the controller may admit the move only in an authorized influence
  cohort

#### Scenario: Recommendation is speculative, stale, late, malformed, or slow

- **WHEN** any eligibility condition fails or no result is ready
- **THEN** it has zero effect on the live response

### Requirement: Operational Traces Are Never Feedback Evidence

The system SHALL derive evaluator input and feedback authority only from frozen
canonical transcript and trusted answer-block evidence.

#### Scenario: Planner and tool traces differ

- **WHEN** two runs have identical canonical transcript/integrity/settlement
  evidence but different brief rationale, controller state, move IDs, Director
  output, tool traces, or hidden reasoning
- **THEN** their evaluator input and allowed feedback outcome are identical

### Requirement: Rollout Is Measured, Reversible, And Human-Gated

The system SHALL keep all new behavior default off and SHALL establish numeric
quality/latency baselines in SAV-467/SAV-469 before influence advances.

#### Scenario: Contract support lands

- **WHEN** readers and schemas deploy
- **THEN** current v1 prompt-led behavior remains active by default

#### Scenario: Rollback is required

- **WHEN** an owner or gate rejects the adaptive path
- **THEN** versioned flags disable influence, Director, tools, controller, and
  brief emission without data migration

#### Scenario: Automated gates pass

- **WHEN** benchmark and hosted checks pass
- **THEN** the result is readiness evidence only
- **AND** Production/default-on remains a human-owner decision
