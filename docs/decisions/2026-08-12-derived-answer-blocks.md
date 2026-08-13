# Derived Answer Blocks As The Evaluation Unit

Status: accepted

Date: 2026-08-12

## Decision

Meelni keeps canonical transcript events as the immutable integrity, evidence,
and citation ledger. It derives typed candidate answer blocks as the stable
evaluation and presentation unit after canonical trust, replay, and injection
preparation. Adjacent finalized candidate fragments may coalesce only across a
bounded, explicit continuity contract; interviewer follow-up, role, integrity,
timing, writer, section, cutoff, and end boundaries prevent coalescing.

Answer-block derivation is deterministic core behavior with no provider call or
raw transcript telemetry. Equivalent semantic speech split into 1, 2, 5, or 10
adjacent finals must preserve workflow completion statistics, completion tier,
and provider mode. Exact source event identities and text remain the only
citation authority.

An exact semantic replay authenticated by the transcript preparation boundary
may advance sequence continuity only when its accepted anchor, speaker, writer
identity/generation, and timing are coherent. It never becomes evidence. A
non-exact replay-family omission that can affect candidate evidence or prompt
binding makes the evaluation snapshot ineligible and degraded rather than
creating countable answer breadth. An interviewer-only transcript remains
no-reviewable. An unknown sequence gap or conflicting replay continuity fails
closed too.

## Consequences

- Transcript transport segmentation cannot create or remove reviewable answer
  breadth.
- Canonical rows remain immutable and independently auditable; derived joined
  text cannot replace frozen evidence.
- Sessions retain multiple prompt-bound answer blocks instead of becoming one
  session-wide blob.
- Corrupt, overlapping same-speaker, replay-conflicting, post-cutoff, or
  otherwise unverifiable canonical input fails closed at existing integrity
  boundaries.
- Exact replay variants preserve accepted canonical citations and provider
  input; non-exact or conflicting replay input never invokes the evaluator.
- Historical rows without canonical identity keep their compatibility path;
  mixed malformed canonical rows never downgrade to legacy treatment.
- SAV-421 may consume the public answer-block projection, but scoring-policy
  replacement and unsupported score inference are outside this decision.
