# SAV-369 stable answer-block derivation

## Why

Immutable canonical transcript events correctly preserve runtime evidence, but
STT finalization can split one natural candidate answer into several rows.
Counting or classifying those rows independently makes feedback inputs vary
with transport segmentation rather than candidate meaning.

## Outcome

Introduce a typed, provider-free candidate answer-block derivation that binds
an interviewer prompt/follow-up to one logically continuous response while
retaining exact source event provenance. Equivalent speech split 1, 2, 5, or
10 ways produces invariant completion statistics, tier, and provider mode,
while canonical citations keep exact original event identities and text.

## Boundaries

- Preserve canonical ledger immutability, trust/security preparation, replay
  handling, measured timing, writer generation, speaker roles, and cutoffs.
- Fail closed or separate on explicit prompt, marker, canonicalization, writer,
  sequence, section, timing, cutoff, and end boundaries.
- Retain legacy persisted-session compatibility without manufacturing canonical
  provenance.
- Do not add provider grouping, transcript telemetry, persistence migration,
  SAV-421 scoring-policy changes, Production action, or provider mutation.
