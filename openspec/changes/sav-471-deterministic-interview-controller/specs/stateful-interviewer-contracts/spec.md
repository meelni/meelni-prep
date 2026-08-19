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

#### Scenario: Generation reaches the public runtime boundary

- **WHEN** a controller-admitted reply reaches the public LiveKit LLM node
- **THEN** its public chat context must contain the finalized candidate message
  identity and the exact admitted move snapshot identity
- **THEN** the adapter observes monotonic time again before provider generation
- **AND** a non-close move crossing into closing is aborted without speech
- **AND** any move reaching elapsed is fenced without speech or snapshot

#### Scenario: A stale preemptive generation reaches the boundary

- **WHEN** a preemptive pipeline does not carry the finalized candidate message
  and exact admitted move snapshot identities
- **THEN** generation is denied without mutating controller state
- **AND** the matching finalized pipeline may authorize that move exactly once

#### Scenario: A speech handle lacks exact generation authority

- **WHEN** a created handle lacks exact finalized-turn, move, and one-time turn
  nonce authorization, or its identity was evicted, duplicated, or replayed
- **THEN** its scheduled, aborted, or interrupted completion does not mutate
  controller state
- **AND** it cannot correlate transcript or interruption evidence to the move
- **AND** predictable turn/move IDs plus ambient handle lineage cannot consume
  the nonce held by the intended temporary context
- **AND** a handle created before the current admitted generation epoch cannot
  consume that nonce even when handed the exact current temporary context
- **AND** a later same-epoch handle cannot replace the first public
  `generate_reply` handle bound to that nonce
- **AND** the nonce is synchronously consumed before controller-state mutation
  and redacted only in an isolated provider-bound copy after authorization
- **AND** a denied shallow context copy cannot mutate or strip the intended
  pipeline's shared controller item

#### Scenario: A retired speech identity is reused or capacity is exhausted

- **WHEN** a speech-handle identity reappears after any in-flight eviction
- **THEN** its generation and completion are exact controller-state and
  evidence-correlation no-ops
- **AND** the bounded session-lifetime seen ledger never evicts identities
- **AND** reaching its explicit capacity disables controller authority before
  accepting another identity, preserving base-interviewer generation

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

#### Scenario: The final catalog transition was delivered

- **WHEN** the controller is at the final objective and topic and its transition
  into that tail was canonically delivered
- **THEN** the next admitted move is `close`
- **AND** warning policy cannot admit another transition against the same tail

### Requirement: Terminal And Suppressed Turns Preserve Transcript Evidence

The system SHALL keep controller authority byte-stable after terminal while
allowing finalized candidate transcript evidence to follow the existing
conversation-item persistence path.

#### Scenario: Candidate turn crosses elapsed or arrives after terminal

- **WHEN** the controller suppresses a reply because the completed turn reaches
  elapsed or the state was already terminal
- **THEN** the hook returns normally and the public LLM node produces an empty
  generation
- **AND** LiveKit commits and emits the finalized candidate item exactly once
- **AND** no interviewer reply is generated

#### Scenario: Candidate explicitly exits before the deadline

- **WHEN** a finalized candidate turn makes an unambiguous, bounded
  stop/end/finish request with an interview/session target or clear
  temporal/deictic termination context while time remains
- **THEN** the controller admits one graceful `close` move
- **AND** terminal state begins only after canonical close delivery
- **AND** ordinary answer content using those verbs does not request exit

#### Scenario: A legal event replays after terminal

- **WHEN** any recognized controller event has valid shape and the exact
  terminal state revision
- **THEN** the reducer returns the identical state object with no snapshot
- **AND** clock, writer, lifecycle, ledger, and revision remain unchanged

### Requirement: Disabled State Preserves Current Runtime Behavior

The system SHALL keep the deterministic controller disabled by default behind
an exact server-owned feature flag.

#### Scenario: Flag is absent or false

- **WHEN** a full interview starts without the exact enabling value
- **THEN** no controller snapshot or lifecycle mutation is applied
- **AND** current barge-in, dual-liveness, reconnect, transcript integrity,
  deadline, user-end, and settlement behavior remains unchanged
