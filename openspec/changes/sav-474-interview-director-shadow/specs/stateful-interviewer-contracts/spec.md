## ADDED Requirements

### Requirement: Director Shadow Is Read-Only And Asynchronous

The system SHALL keep Director shadow work off the media critical path and
structurally unable to affect the live interview or customer evidence.

#### Scenario: Finalized transcript is persisted

- **WHEN** an authoritative candidate transcript event is durably accepted
- **THEN** the runtime may submit bounded context asynchronously to the shadow
- **AND** ignores the observer status/result
- **AND** prompt, speech, controller, transcript projection, watchdog,
  settlement, answer blocks, feedback, and customer output continue unchanged

#### Scenario: Shadow is configured in this repository slice

- **WHEN** the exact shadow flag is absent, false, or true
- **THEN** the application injects no Director adapter and executes no model
- **AND** no Preview, Production, provider, spend, or influence action occurs

### Requirement: Recommendations Are Bounded Finalized Advice

The system SHALL accept only a typed, versioned, fresh recommendation bound to
one session, writer generation, controller/lifecycle version, finalized source
turn/revision, accepted move vocabulary, bounded target/reason, and deterministic
expiry.

#### Scenario: Interim work matches the final text

- **WHEN** speculative work completes and the authoritative final has the same
  content digest
- **THEN** it is reconciled to the final transcript revision before storage
- **AND** in-flight work binds to the exact state/lifecycle authority captured
  when that final turn becomes available, not its speculative state revision
- **AND** the stored recommendation is labeled finalized

#### Scenario: Interim and final text differ

- **WHEN** the authoritative final differs from speculative input
- **THEN** speculative work/result is canceled or discarded
- **AND** raw interim text and hidden reasoning are not persisted or emitted

#### Scenario: Work is unsafe or late

- **WHEN** work times out, fails, is canceled, is malformed, exceeds a bound,
  loses authority, expires, or arrives after settlement
- **THEN** it is ignored with bounded content-free telemetry
- **AND** has zero live effect

### Requirement: Shadow Storage And Comparison Are Session-Local

The system SHALL use bounded memory with latest-valid-by-source semantics and
exact canonical-delivery attribution.

#### Scenario: Duplicate, replayed, or out-of-order data arrives

- **WHEN** a recommendation, source revision, or delivery identity repeats or
  an older completion arrives after a newer one
- **THEN** exact duplicates are no-ops, conflicts fail closed, and the newer
  fresh source result remains authoritative for comparison

#### Scenario: Writer reconnects or session settles

- **WHEN** writer generation rolls over or settlement begins
- **THEN** old work/correlations are canceled and cleared
- **AND** no old-generation or cross-session result is addressable

#### Scenario: Canonical move is delivered before or after recommendation

- **WHEN** both sides exist for the exact session/source turn/revision/move
- **THEN** the system records exact, target-mismatch, move-mismatch, or
  arrived-after-delivery comparison metadata
- **AND** changes neither recommendation nor canonical delivered move

### Requirement: Counterfactual Vocabulary Grants No Authority

The system SHALL distinguish shadow comparison vocabulary from SAV-471 live
allowed-move authority.

#### Scenario: Canonical controller move is pending

- **WHEN** SAV-471 live `allowed_moves` is empty because one move is pending
- **THEN** bounded shadow context may use the global accepted move vocabulary
  only for counterfactual comparison
- **AND** that vocabulary/result never enters the live prompt or controller

#### Scenario: Deadline or lifecycle is closed

- **WHEN** time is elapsed/zero, speech is fenced, or lifecycle is not
  connecting, active, or reconnecting
- **THEN** the shadow vocabulary is empty and no recommendation authority exists

### Requirement: Shadow Telemetry Is Content-Free

The system SHALL emit SAV-469-compatible versioned outcome, freshness,
readiness, latency/age, cost-estimate, and comparison metadata without content.

#### Scenario: Telemetry is emitted

- **WHEN** shadow work changes bounded operational state
- **THEN** telemetry contains no session/turn identity, prompt, raw transcript,
  evidence quote, provider/model name, secret, tool payload, or chain of thought
- **AND** synthetic fixture comparisons establish plumbing only, not a
  real-model quality/cost/readiness threshold

#### Scenario: Readiness and comparison are aggregated

- **WHEN** a finalized turn waits for Director concurrency, builds bounded
  context, publishes one recommendation, and is later compared as expired
- **THEN** ready latency includes the queue and context-build interval
- **AND** the comparison marks the one result stale without adding another
  result or readiness sample

#### Scenario: Shadow flag is malformed

- **WHEN** the server flag contains whitespace, mixed case, a blank, or any
  value other than exact lowercase `true`
- **THEN** both Director execution and observability cohort selection remain
  disabled/current
