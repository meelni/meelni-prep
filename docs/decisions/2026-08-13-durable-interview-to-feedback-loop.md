# Durable Interview-To-Feedback Loop

Status: accepted

Date: 2026-08-13

## Context

Meelni already accepts End Interview quickly, runs terminalization and feedback
through durable workers, freezes canonical transcript evidence, derives
prompt-bound answer blocks, and fails closed when transcript integrity cannot be
established. Those controls prevent invented feedback, but two remaining
couplings make the experience slower and less useful than it should be:

- the web worker still asks the active LiveKit participant for a final runtime
  settlement over a data packet and waits for the acknowledgement before it
  freezes the session; and
- a partial session snapshot constrains the whole evaluator to coaching even
  when earlier, logically closed answer blocks are independently trustworthy.

The packet path is a best-effort transport, not durable intent. It can lose the
race with participant disconnect or agent shutdown. The session-wide scoring
constraint is also broader than the evidence it protects: an unverified tail
must not invalidate an already closed, gap-free answer to an earlier prompt.

Feedback latency is currently measured mostly as a final duration. The product
cannot reliably distinguish queue delay, evaluator delay, retry delay, or a
permanent configuration failure, and the candidate waits on a mostly empty
processing surface.

## Decision

### Settlement is a durable command, not a packet round trip

Accepting End Interview must atomically persist the semantic cutoff, current
writer generation, and an idempotent runtime-settlement command or outbox
record. That durable command is the authority for work that remains after the
HTTP request returns.

The LiveKit data packet remains a low-latency wake-up hint. The Python runtime
must also discover the command during explicit end/disconnect/shutdown paths,
drain through the requested cutoff, and persist a writer-scoped acknowledgement.
The finalizer waits for that acknowledgement only within a bounded settlement
budget and then freezes an explicitly classified snapshot from canonical
database evidence. Replays, competing generations, and late acknowledgements
must be idempotent and fenced.

### Score authority is decided per closed answer block

Session completeness and answer-block trust are separate facts. An answer block
may support numerical dimension evidence only when it is committed, gap-free,
prompt-bound, cutoff-safe, associated with a healthy writer generation, and
logically closed by an accepted boundary.

An unverified terminal tail may limit the session without tainting earlier
trusted closed blocks. In particular, the exact terminal
`interviewer/no_provider_confirmed_prefix` condition may constrain the tail
while preserving prior candidate blocks. Candidate interruption markers,
canonicalization failures, sequence gaps, degraded writers, malformed
boundaries, and post-cutoff evidence continue to fail closed.

The authoritative batch evaluator may return supported dimension scores from
trusted closed blocks in a partial session. Unsupported dimensions remain
scoreless and every partial scorecard has `overallScore = null`. The server may
not extrapolate a whole-interview score from a verified prefix.

### Latency is one budget with observable stages

Feedback generation must have one end-to-end deadline budget covering queue,
claim, evidence preparation, provider evaluation, validation, and persistence.
Each attempt records an identity- and content-free stage, outcome, reason,
duration, and attempt number. Retry policy is based on a closed failure
taxonomy: transient transport/rate/capacity failures may retry within the
remaining budget; invalid contract, authentication/configuration, integrity,
and fenced-work failures do not retry blindly.

Model, provider, and queue-policy changes must be evaluated against sanitized
provider-free fixtures first. Paid calls, provider mutations, Production
configuration, and default-on rollout remain separately human-authorized.

### Processing is a useful saved-review workspace

After End is accepted, the feedback route should immediately show the saved
interview evidence already safe to present, the current durable feedback stage,
and an honest leave-and-return expectation. It must not invoke a second
free-form model to manufacture a preview while the authoritative evaluator is
running.

### Incremental evaluation begins only as non-authoritative shadow work

Per-answer evaluation may be explored only behind a default-off shadow seam.
Its artifact identity must bind the session, trusted answer-block fingerprint,
rubric version, prompt version, schema version, and model version. Shadow work
is idempotent, has no customer-visible or insights side effects, and cannot
replace the final batch result. Its purpose is to measure agreement, latency,
failure rate, and estimated cost before any later owner decision.

## Consequences

- End intent survives browser, packet, and participant shutdown races.
- A trustworthy completed answer can produce calibrated dimension evidence
  even when a later tail cannot be verified, without inventing an overall
  score.
- Operators can locate queue, settlement, provider, validation, and persistence
  latency without logging transcripts or feedback content.
- The candidate receives useful, truthful progress immediately instead of an
  empty spinner.
- Incremental evaluation remains reversible and non-authoritative until it has
  evidence strong enough for a separate decision.
- New storage and payload contracts must be additive, versioned, replay-safe,
  and covered by sanitized or synthetic fixtures.

This decision extends, rather than weakens,
[Interview Lifecycle Reliability](../architecture/interview-lifecycle-reliability.md),
[Evidence-Gated Feedback Outcomes](2026-08-10-evidence-gated-feedback-outcomes.md),
[Derived Answer Blocks As The Evaluation Unit](2026-08-12-derived-answer-blocks.md),
and
[Round-Specific Dimension Evidence Coverage](2026-08-12-round-specific-dimension-evidence-coverage.md).
The delivery contract and dependency graph are in
[Interview-To-Feedback Delivery Program](../architecture/interview-to-feedback-program.md).
