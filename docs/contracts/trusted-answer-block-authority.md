# Trusted Closed Answer-Block Authority

Status: version 1 provider-neutral core contract

## Purpose

`projectTrustedClosedAnswerBlocks` separates frozen session completeness from
the authority of individual SAV-369 candidate answer blocks. It consumes the
existing ordered canonical ledger projection plus normalized frozen writer
facts and returns only a deterministic trusted prefix. It neither scores nor
persists feedback.

Canonical events remain immutable evidence and citation truth.
`deriveCandidateAnswerBlocks` remains the only grouping implementation. This
contract projects those exact `CandidateAnswerBlock` objects; it does not
create another answer model.

## Versioned input

`frozen-answer-block-authority.v1` contains:

- frozen snapshot state: `complete | partial`;
- the exact terminal cutoff in epoch milliseconds; and
- the validated writer contract version, ID, generation, committed sequence,
  integrity state, and settlement state.

The database, durable settlement command, acknowledgement, and provider
payloads do not enter core. A caller must first normalize the frozen database
evidence established by the transcript and SAV-442 settlement contracts.
Writer IDs reuse the accepted transcript persistence constraint: trimmed
content must be non-empty and the stored string is limited to 256 characters.
The v1 projection accepts exactly one writer authority. Missing, additional,
unknown-version, malformed, stale, or identity-drifting writer facts fail
closed.

Every sequenced ledger event must belong to that exact writer and generation,
and the projection must contain the complete contiguous range from sequence 1
through the frozen committed sequence. Every turn end and marker occurrence
must be at or before the cutoff. Exactly one cutoff/session-end event must be
last and equal the frozen cutoff.

## Closure authority

After the existing answer-block derivation succeeds, a block is trusted only
while every earlier block in the prefix remains trusted and the block is:

1. committed and gap-free under the writer authority above;
2. prompt-bound to non-empty interviewer source turns;
3. composed only of candidate response source turns;
4. cutoff-safe and from the one healthy writer generation; and
5. logically closed by one accepted boundary.

Accepted logical closure is deliberately narrow:

| Derived boundary                                                                                | Authority                                                                                                                 |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Interviewer follow-up                                                                           | Closes the preceding prompt-bound candidate block.                                                                        |
| Explicit section change                                                                         | Closes the preceding prompt-bound block; later evidence must still prove its own prompt binding.                          |
| Session end or cutoff                                                                           | Closes the final block only when the frozen snapshot is complete and the writer settlement is `settled`.                  |
| Exact terminal `interviewer/no_provider_confirmed_prefix` marker                                | Preserves only earlier independently closed blocks. The block affected by the marker remains an excluded unverified tail. |
| Long silence, input exhaustion, raw writer change, replay boundary, or other derived separation | Does not establish trust. The block and later suffix are excluded.                                                        |

The preserving marker exception is exact. It must be the single final
sequenced event and may be followed only by the frozen terminal boundary. A
marker timestamp before previously sequenced speech ends is malformed. A
candidate marker, any `canonicalization_failed` marker, a malformed or
non-terminal preserving marker, sequence gap, conflicting replay, writer
drift/degradation, or cutoff conflict returns `integrity_failure` with no
trusted blocks or identities.

## Projection and identity

`trusted-answer-block-projection.v1` returns:

- `complete`, `verified_prefix`, `no_trusted_blocks`, or `integrity_failure`;
- the original trusted `CandidateAnswerBlock` objects;
- one closure-authority record per trusted block;
- one `trusted-answer-block-identity.v1` record per trusted block;
- content-free excluded block IDs and closed reasons; and
- a closed failure reason for integrity failures.

The three trusted arrays are aligned one-to-one by `answerBlockId`. The raw
identity builder is private so callers cannot mint a trusted-looking identity
from an arbitrary block. An identity is emitted only through a successful
projection.

The identity has the form `trusted-answer-block.v1:<sha256>`. Its canonical
material binds the identity version, block ordinal, joined prompt/response
text, outer response timing, and accepted closure kind. It deliberately omits
canonical event IDs, writer IDs, sequences, and fragment count, making it
stable when equivalent speech is split into 1, 2, 5, or 10 canonical finals.
Canonical source events remain the only citation authority.

## Compatibility and non-goals

The v1 projection is additive. It does not modify the existing answer-block
contract, session validator, feedback schemas, stored rows, historical
readers, calibration v1 corpora, or current qualitative-only behavior for
partial snapshots. Unknown authority versions fail closed and never fall back
to a historical or mutable transcript path.

SAV-440 separately owns any evaluator wiring, sparse supported dimension
scores, `overallScore = null` policy, persistence, authenticated reads, and UI.
This contract alone authorizes none of those behaviors.
