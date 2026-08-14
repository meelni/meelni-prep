# Trusted closed answer-block authority delta

## Requirement: trusted authority is derived from frozen canonical facts

The system MUST project trusted blocks only from an exact supported frozen
authority, one healthy writer identity/generation, a complete gap-free
committed sequence, cutoff-safe ledger events, and one exact terminal boundary.
Unknown versions, malformed authority, writer drift/degradation, sequence gaps,
and post-cutoff evidence MUST return no trusted blocks or identities.

### Scenario: degraded writer

Given either writer integrity or settlement is degraded, the projection MUST
return `integrity_failure` with no trusted block, identity, or closure record.

### Scenario: cutoff conflict

Given a turn ends or marker occurs after the frozen cutoff, the projection MUST
fail closed even when the remaining ledger shape is valid.

## Requirement: only accepted logical boundaries establish closure

Interviewer follow-up and explicit section transition MUST close the preceding
prompt-bound block. A terminal boundary MUST close the final block only with a
complete snapshot and settled writer authority. Silence, input exhaustion,
missing settlement, or raw cutoff presence MUST NOT manufacture closure.

### Scenario: missing settlement

Given an earlier block closed by an interviewer follow-up and a later open
terminal answer with missing settlement, the projection MUST retain only the
earlier trusted block and exclude the terminal tail.

## Requirement: the preserving marker protects only prior closed blocks

Only the exact terminal `interviewer/no_provider_confirmed_prefix` marker MAY
preserve prior independently closed blocks. The marker MUST NOT close the
affected answer. Candidate markers, canonicalization failures, additional or
non-terminal preserving markers, and markers timestamped before previously
sequenced speech ends MUST fail closed.

### Scenario: terminal preserving marker

Given one prior follow-up-closed block and one answer affected by the exact
terminal preserving marker, the projection MUST return the prior block as a
verified prefix and exclude the affected block.

## Requirement: trusted identity is projection-owned and segmentation-invariant

The projection MUST emit exactly one versioned SHA-256 identity and one closure
record for each trusted block, aligned by answer-block ID. No identity MUST be
emitted for excluded or failed blocks, and the raw identity builder MUST NOT be
public. Equivalent speech split across 1, 2, 5, or 10 canonical events MUST
produce identical trusted content and identities.

### Scenario: segmentation variation

Given equivalent prompt/answer speech with unchanged outer timing and closure,
all supported segmentation variants MUST produce the same ordered trusted
identities.

## Requirement: SAV-441 does not activate scoring

The change MUST NOT alter feedback scoring, provider input, persistence,
authenticated reads, UI, dashboard aggregates, or historical feedback
interpretation.

### Scenario: historical authority version

Given an unsupported historical authority input, the new projection MUST fail
closed while the existing answer-block derivation remains unchanged.
