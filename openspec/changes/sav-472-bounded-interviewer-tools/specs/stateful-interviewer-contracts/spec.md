## ADDED Requirements

### Requirement: Interviewer Tools Are Local And Bounded

The system SHALL expose exactly five session-scoped tools only when controller,
writer, lifecycle, deadline, and feature-gate authority are current.

#### Scenario: A legal tool call executes

- **WHEN** one strict request binds the current session, writer generation,
  deadline, and required revisions
- **THEN** a read is side-effect free or one mutation is controller-authorized
- **AND** the result has one typed success/failure/fallback outcome
- **AND** no tool accesses remote lifecycle, provider, transcript search,
  feedback, billing, account, secret, deploy, or Production authority

#### Scenario: A tool call is stale, malformed, slow, duplicated, or raced

- **WHEN** any required authority fails or the 150 ms deadline expires
- **THEN** the rejected request makes no partial state or evidence mutation
- **AND** controller policy may separately admit one deterministic fallback move
  without using model-supplied move fields
- **AND** the current speech/transcript/deadline/settlement fallback is not
  blocked

#### Scenario: A turn attempts unnecessary or recursive calls

- **WHEN** a tool name repeats, execution recurses/concurrently overlaps, a
  fourth call is attempted, or commit/close already bound the handle
- **THEN** the call is rejected without mutation
- **AND** one controller-bound tool-free fallback may run
- **AND** later same-handle tool calls and fallback re-entry are denied

#### Scenario: Provider returns mixed text and tool calls

- **WHEN** a required-tool provider response contains both model text and one or
  more function calls
- **THEN** the runtime SHALL preserve eligible function calls but discard the
  pre-commit text before LiveKit transcript or TTS forwarding
- **AND** only a later controller-authorized continuation may produce speech

#### Scenario: Sibling failure races a mutation

- **WHEN** concurrent calls on one handle race a typed failure against commit or
  close
- **THEN** one serialized terminal path SHALL win
- **AND** a failure winner prevents queued mutation while a mutation winner
  prevents fallback residue
- **AND** no admitted silent move remains

### Requirement: Lifecycle Authority Is Reader-First And Current-Writer-Bound

The system SHALL construct tool authority only from an authenticated lifecycle
reader bound to the exact current transcript writer.

#### Scenario: Initial authority is available

- **WHEN** writer registration succeeds and a separate reader returns active
  lifecycle state with a positive version for the same session, room, writer,
  and current generation
- **THEN** the runtime creates one bounded local lease
- **AND** tools consume only that lease and local controller state

#### Scenario: Authority becomes stale or non-active

- **WHEN** refresh fails, the lease expires, the writer is fenced, or canonical
  lifecycle becomes reconnecting, ending, or terminal
- **THEN** controller/tool authority fails closed for that runtime
- **AND** a later active refresh cannot reopen local speech
- **AND** base speech, transcript persistence, explicit exit, deadline
  watchdogs, and settlement remain independent

### Requirement: Tool Continuation Preserves Single-Use Generation Identity

The system SHALL authorize same-handle continuation only for an explicit bounded
tool turn while preserving SAV-471 prompt-led single-use authority.

#### Scenario: Pinned LiveKit resumes after a tool result

- **WHEN** `llm_node` re-enters on the exact already-authorized public speech
  handle for a tool turn
- **THEN** at most three continuations reuse that handle without another nonce,
  move capability, or completion identity
- **AND** commit advances the one admitted move to generated at most once

#### Scenario: Continuation capacity is exhausted

- **WHEN** the next same-handle step exceeds the cap
- **THEN** exactly one tool-free speech fallback may run
- **AND** every later re-entry is denied deterministically

#### Scenario: A tool fails before commit

- **WHEN** a live tool returns malformed, timeout, unavailable, stale, or raced
- **THEN** the controller admits at most one deterministic fallback move
- **AND** the same handle is immediately tool-fenced
- **AND** exactly one tool-free reply may run before deterministic denial

#### Scenario: Prompt-led or duplicate completion attempts continue

- **WHEN** a SAV-471 prompt-led handle re-enters or another callback presents
  the same string handle ID without the original opaque acceptance object
- **THEN** generation/completion remains denied or state-stable as appropriate
- **AND** the accepted original alone may correlate canonical delivery evidence
