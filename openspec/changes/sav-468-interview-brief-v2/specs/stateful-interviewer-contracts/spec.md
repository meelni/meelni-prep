## ADDED Requirements

### Requirement: Stable Start Compiles Complete Interview Context

The system SHALL compile and persist one deterministic `InterviewBriefV2` from
accepted session-start authorities before LiveKit room entry and SHALL reuse
the stored wire on replay.

#### Scenario: Selected question is explicit

- **WHEN** a selected question is accepted for a new start
- **THEN** the brief preserves its exact ID, text, company, and type
- **AND** no candidate identity, email, transcript, or provider credential is
  included

#### Scenario: Optional history context is unavailable

- **WHEN** no trusted versioned company context or candidate practice goal is
  available
- **THEN** both optional brief fields are `null`
- **AND** the compiler performs no live lookup to invent them

#### Scenario: Stable start is replayed

- **WHEN** a retry loads a previously accepted start
- **THEN** it reuses the exact persisted brief wire
- **AND** does not replace the brief with newly compiled bytes

### Requirement: Every PM Round Has A Bounded Catalog

The system SHALL provide one versioned round pack for behavioral, product
sense, execution, and strategy with bounded objectives, probe families,
transition guidance, close guidance, and fixed forbidden behavior.

#### Scenario: Runtime consumes a round pack

- **WHEN** Python accepts a correlated brief
- **THEN** it presents the pack as an adaptive catalog rather than a script,
  answer key, rubric, or evaluator
- **AND** coaching, hints, and mid-session evaluation remain forbidden

### Requirement: Brief Consumption Preserves V1 Compatibility

The system SHALL use the accepted brief only after strict TypeScript/Python
version, digest, shape, and room-authority validation.

#### Scenario: Brief is missing or cannot be trusted

- **WHEN** the brief is absent, malformed, unknown-version, digest-invalid, or
  inconsistent with v1 room metadata
- **THEN** Python starts and completes using the existing v1 prompt behavior
- **AND** selected-question, deadline, hints-off, and end-only policy remain
  authoritative

### Requirement: Trace Versions Are Sanitized

The system SHALL attach only allowlisted contract-version and resolution tokens
for brief, prompt, policy, and round pack to full-interview trace metadata.

#### Scenario: Trace metadata is exported

- **WHEN** a v2 or fallback session runs with tracing enabled
- **THEN** version and resolution tokens may be exported
- **AND** candidate identity, session identity, question content, transcript,
  company content, provider credentials, and model controls are excluded
