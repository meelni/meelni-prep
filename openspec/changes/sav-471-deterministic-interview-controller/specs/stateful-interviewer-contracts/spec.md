## ADDED Requirements

### Requirement: One Deterministic Controller Owns Interview Intent

The system SHALL use a pure, versioned controller to derive phase, current
objective/topic, time band, allowed next moves, interruption recovery, warning,
closing, and terminal state when the controller feature is enabled.

#### Scenario: Candidate turn completes

- **WHEN** one completed candidate turn is accepted
- **THEN** the controller admits at most one legal next move
- **AND** emits one bounded turn-local snapshot that permits at most one
  substantive interviewer question
- **AND** the voice model owns natural wording but not move type or timing

#### Scenario: State or transition is invalid

- **WHEN** the controller receives stale, malformed, or illegal state
- **THEN** it returns one stable failure reason
- **AND** the runtime disables the controller for that session
- **AND** the existing interviewer, transcript, deadline, and settlement paths
  continue

### Requirement: The Deadline Owns Canonical Interview Time

The system SHALL derive elapsed and remaining time from the accepted absolute
deadline and a monotonic anchor rather than asking the model to estimate time.

#### Scenario: Monotonic time enters a new band

- **WHEN** projected remaining time crosses a configured deterministic boundary
- **THEN** warning, closing, or elapsed state changes exactly once
- **AND** allowed moves exclude actions that cannot fit the remaining band

#### Scenario: Deadline has elapsed

- **WHEN** projected remaining time reaches zero
- **THEN** the controller admits no new interviewer move and produces no
  snapshot
- **AND** the existing hard-deadline watchdog fences, settles, and terminates
  without waiting for model speech
- **AND** a graceful `close` may be admitted only in the pre-deadline closing
  band

### Requirement: Only Delivered Evidence Commits Move History

The system SHALL track planned/admitted, generated, scheduled, spoken,
interrupted, aborted, and canonically delivered move identities separately.

#### Scenario: Speech is interrupted before delivery

- **WHEN** an admitted move has no acknowledged canonical interviewer transcript
  event
- **THEN** it is not added to committed probe history
- **AND** the controller may recover the same intent without skipping or
  duplicating a delivered question

#### Scenario: Speech delivery is acknowledged

- **WHEN** the existing transcript writer acknowledges authoritative delivered
  evidence for the move
- **THEN** the move is committed exactly once
- **AND** later candidate turns cannot repeat it unless an explicit,
  inspectable clarification reason permits that intent

### Requirement: Disabled State Preserves Current Runtime Behavior

The system SHALL keep the deterministic controller disabled by default behind
an exact server-owned feature flag.

#### Scenario: Flag is absent or false

- **WHEN** a full interview starts without the exact enabling value
- **THEN** no controller snapshot or lifecycle mutation is applied
- **AND** current barge-in, dual-liveness, reconnect, transcript integrity,
  deadline, user-end, and settlement behavior remains unchanged
