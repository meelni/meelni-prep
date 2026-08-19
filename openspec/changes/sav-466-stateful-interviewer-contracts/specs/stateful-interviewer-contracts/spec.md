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

#### Scenario: Nested decoy or duplicate top-level brief arrives

- **WHEN** a same-named `interview_brief` property appears below another
  top-level field
- **THEN** raw-number validation ignores that decoy and validates the exact
  decoded top-level brief
- **AND WHEN** the top-level object contains duplicate decoded
  `interview_brief` keys
- **THEN** the optional brief falls back as `invalid_payload`

#### Scenario: Top-level version 2 arrives

- **WHEN** current readers receive top-level room-metadata version 2
- **THEN** runtime start fails as an unsupported contract

#### Scenario: Top-level version 1 uses a non-canonical numeric token

- **WHEN** top-level room-metadata `contract_version` is spelled as `1.0` or
  `1e0`
- **THEN** TypeScript and Python both reject the unsupported wire contract
- **AND** JavaScript does not normalize the value to integer version 1
- **AND** duplicate top-level version keys are likewise unsupported

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

#### Scenario: Numeric wire spelling is non-canonical

- **WHEN** `duration_minutes` uses a float or exponent token such as `30.0` or
  `3e1`, or a timestamp is not a canonical UTC string
- **THEN** TypeScript and Python reject the brief before hashing
- **AND** optional nested-brief negotiation falls back to validated v1 behavior

#### Scenario: Another contract integer has a float or exponent spelling

- **WHEN** an integer-bearing runtime-state, move, tool request/result, or
  Director field uses a float or exponent token
- **THEN** TypeScript and Python both reject it as `invalid_payload`

#### Scenario: Brief text contains invalid Unicode

- **WHEN** any brief string contains a lone high or low surrogate
- **THEN** TypeScript and Python reject it as `invalid_payload`
- **AND** optional room-metadata negotiation falls back to v1 without crashing
- **AND WHEN** a valid astral Unicode scalar is present
- **THEN** both runtimes produce the same canonical UTF-8 bytes and digest

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

- **WHEN** a durable transcript-v2 event binds the move through its existing
  event ID, writer ID/generation, sequence, and delivered or
  partially-delivered evidence
- **THEN** the controller may mark it `canonically_delivered`
- **AND** an exact replay produces the same attribution without a second move

#### Scenario: Interruption has no provider-confirmed prefix

- **WHEN** the existing integrity marker matches event ID, writer/generation,
  and sequence
- **THEN** the ledger may attribute the interruption marker
- **AND** no delivered text or feedback evidence is created

### Requirement: Move Admission Is CAS-Protected And Idempotent

The system SHALL bind mutating decisions to session, writer generation,
controller state revision, independent lifecycle version, freshness, and an
idempotency key.

#### Scenario: Exact mutation is retried

- **WHEN** the same idempotency key and canonical request bytes are replayed
- **THEN** the original result is returned as `duplicate`
- **AND** state does not advance again

#### Scenario: Key is reused for a different request

- **WHEN** an idempotency key is reused with different canonical request bytes
- **THEN** the request fails as `idempotency_conflict`

#### Scenario: Mutation request key order changes

- **WHEN** commit or close semantic payload fields are identical but object
  keys are reordered and `call_id` changes for the retry
- **THEN** TypeScript/Python canonical request digests remain identical
- **AND** the replay is `duplicate`

#### Scenario: State, lifecycle, or writer is stale

- **WHEN** the expected controller revision, expected positive lifecycle
  version, or writer generation is not current
- **THEN** the request fails without mutation

#### Scenario: Exact object-expiry boundary is reached before the session deadline

- **WHEN** current time equals the accepted move or recommendation expiry and
  the canonical session deadline remains in the future
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

#### Scenario: State-sensitive tool reaches the canonical session deadline

- **WHEN** probe lookup, move commit, or graceful-close admission runs exactly
  at the canonical runtime deadline or later
- **THEN** admission returns `deadline_elapsed` independently of the tool
  request deadline or move expiry
- **AND** a read-only state/clock result cannot authorize a move
- **AND** the deterministic controller may select its deadline-close fallback

#### Scenario: Tool move is not allowed by fresh state

- **WHEN** probe lookup lacks `probe`, a committed move type is absent, or
  graceful close lacks `close` in the fresh state's `allowed_moves`
- **THEN** admission returns `move_not_allowed` without mutation

#### Scenario: Tool requests privileged data or mutation

- **WHEN** a request attempts database, billing, account, feedback, secret,
  provider-admin, deployment, Production, or lifecycle access
- **THEN** no accepted schema or adapter exists for that capability

#### Scenario: Successful result embeds mismatched authority

- **WHEN** an `ok` or `duplicate` state result embeds a different session,
  active writer, writer generation, or state revision than its envelope
- **THEN** the whole result is rejected
- **AND WHEN** a committed move differs from its envelope session or writer, or
  its source revision plus one differs from `observed_state_revision`
- **THEN** the whole result is rejected

#### Scenario: Standalone-valid result does not match pending request

- **WHEN** call ID, tool name, session, writer/generation, request deadline, or
  applicable controller/lifecycle revision differs from the pending request
- **THEN** adapter-level result assessment rejects it before use
- **AND WHEN** a probe result contains a question other than the request's
  active selected question
- **THEN** assessment returns `question_mismatch`

### Requirement: Director Advice Never Owns Live Behavior

The system SHALL treat `DirectorRecommendation` as bounded asynchronous advice
that the controller may reject and the live interviewer never awaits.

#### Scenario: Recommendation is fresh and valid

- **WHEN** session, brief, writer, controller state, lifecycle version,
  finalized source turn and transcript revision, active question, freshness,
  active lifecycle, deadline, and
  allowed-move policy all match
- **THEN** the controller may admit the move only in an authorized influence
  cohort

#### Scenario: Recommendation targets stale evidence or another question

- **WHEN** the source transcript revision differs from the authoritative
  finalized-turn revision
- **THEN** admission returns `source_transcript_revision_mismatch`
- **AND WHEN** the target question differs from the active selected question
- **THEN** admission returns `question_mismatch`

#### Scenario: Runtime is reconnecting

- **WHEN** lifecycle is `reconnecting`
- **THEN** shadow planning may continue but recommendation admission returns
  `lifecycle_not_active`
- **AND** a fresh `active` state revision is required before admission

#### Scenario: Canonical deadline is reached

- **WHEN** recommendation admission runs exactly at `deadline_at` or later
- **THEN** admission returns `deadline_elapsed` independently of recommendation
  TTL

#### Scenario: Runtime clock projection contradicts its deadline

- **WHEN** observed time, remaining milliseconds, elapsed band, or open/close
  state disagree with the controller's atomic deadline projection
- **THEN** the runtime state is rejected

#### Scenario: Runtime state contains contradictory bounded authority

- **WHEN** lifecycle version is not positive, ledger move IDs repeat, probe
  reason does not match its move type, or closing phase and close state disagree
- **THEN** TypeScript and Python reject the state or payload

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
- **AND** the invariant is measured through the production trusted-answer-block
  projection and production evaluator-request prompt builder

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
