# Shadow feedback execution and comparison

## ADDED Requirements

### Requirement: Only frozen trusted authority schedules shadow work

Scheduling MUST recompute SAV-441 from a terminally frozen canonical ledger
and MUST emit no intent for no-trust, integrity-failure, malformed, or stale
authority.

#### Scenario: Pre-terminal evidence

- **WHEN** no legitimate SAV-441 frozen projection exists
- **THEN** no shadow intent, evaluator call, or artifact access occurs

### Requirement: Execution is structurally default-off

Every side-effecting shadow path MUST validate the independent execution
capability before dependency access, and artifact reads/writes MUST additionally
validate the SAV-445 storage capability.

#### Scenario: Disabled or forged capability

- **WHEN** either required capability is absent, invalid, or forged
- **THEN** database, Inngest, evaluator, comparison, and operational call counts
  remain zero

### Requirement: Durable events and reports are content-free and bounded

Shadow events and reports MUST contain only closed versions/enums, bounded
numbers, UUIDs where routing requires them, and cryptographic fingerprints.
They MUST reject transcript, answer, prompt, evidence prose, provider payload,
raw error, arbitrary strings, and unknown fields.

#### Scenario: Unknown content field

- **WHEN** an intent or report includes a transcript or provider field
- **THEN** strict parsing fails before side effects

### Requirement: Replays converge without claiming universal exactly-once

Completed exact-key work, event replay, reconnect, and crash after a completed
evaluation step MUST not invoke the injected evaluator again. Immutable writes
MUST converge after acknowledgement loss. The contract MUST identify an
ambiguous external completion before durable step commit as unsupported unless
the future provider honors the supplied idempotency key.

#### Scenario: Crash after evaluator step completion

- **WHEN** persistence retries after Inngest has durably memoized evaluation
- **THEN** the evaluator fake is called once and the same artifact is recorded

### Requirement: Comparison cannot affect product authority

Comparison MUST emit only aggregate facet/mode/score agreement, missing and
failed artifact counts, closed failure classes, bounded token/cost estimates,
and post-freeze potential latency. It MUST NOT mutate or satisfy feedback,
insights, billing, UI, or interview state.

#### Scenario: Shadow disagreement

- **WHEN** every shadow score disagrees with the batch authority
- **THEN** the report records disagreement and every product-authority tripwire
  remains untouched

### Requirement: Comparison waits only within the evaluator policy horizon

After authoritative batch completion, comparison MUST use replay-stable durable
sleeps and exact reads for no longer than the SAV-444 90-second deadline. It
MUST stop immediately when no artifact is missing, MUST treat failed artifacts
as terminal, and MUST never schedule a zero or negative sleep.

#### Scenario: Late artifact within the policy horizon

- **WHEN** a shadow artifact arrives more than four seconds after batch
  completion but before the event-anchored horizon expires
- **THEN** a bounded later exact read includes it in the report

#### Scenario: Horizon exhausted

- **WHEN** artifacts remain missing at the deadline
- **THEN** comparison emits one incomplete aggregate report after a bounded
  number of reads and sleeps

### Requirement: Deletion fences every asynchronous side-effect boundary

Scheduling, evaluation, persistence, and comparison MUST revalidate deletion,
session ownership, and the terminal freeze anchor after asynchronous work and
immediately before their next durable effect.

#### Scenario: Deletion during an evaluator request

- **WHEN** deletion starts after a physical evaluator request has begun
- **THEN** the request may finish but its output is discarded without an
  artifact write or report

### Requirement: Latency claims share one terminal freeze anchor

Potential latency lead MUST be unavailable unless batch and shadow completion
timestamps are valid, bounded, and share the same terminal freeze anchor. The
contract MUST NOT claim during-interview savings.

#### Scenario: Mismatched anchor

- **WHEN** timing observations use different freeze anchors
- **THEN** potential latency is reported as unavailable
