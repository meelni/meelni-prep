# Design: Trusted closed answer-block authority

> Amended 2026-08-17 by SAV-453: `verified_prefix` plus zero excluded candidate
> blocks may authorize complete scorecard reduction downstream. This projection
> still does not itself score or persist.

Amended 2026-08-14 by SAV-449: this design supersedes the original
single-terminal preserving-marker restriction.

## Boundary and dependency direction

`packages/core` owns a pure projection. It imports only the existing
answer-block contract. SAV-442 database/runtime command types remain outside
core; future callers normalize frozen cutoff and writer facts before invoking
the projection through the public `@meelni/core` entrypoint.

The projection invokes `deriveCandidateAnswerBlocks` once and returns its
original block objects. It does not fork grouping, citations, replay handling,
or joined-text behavior.

## Frozen authority validation

The strict v1 input carries snapshot state, cutoff, and writer authorities.
Writer IDs reuse the accepted transcript persistence boundary: non-empty after
trimming and at most 256 characters. V1 requires exactly one writer because
writer replacement/drift is not safe to infer across in this slice. Every
sequenced turn, replay projection, and marker must match that
identity/generation and cover exactly sequence 1 through the frozen committed
sequence. The final ledger item must be the sole cutoff/session-end event at
the exact frozen cutoff. All speech ends and marker times must be cutoff-safe;
a marker cannot precede the end of earlier sequenced speech.

Degraded writer integrity, degraded settlement, unknown/malformed contracts,
identity drift, gaps, and cutoff conflicts return an empty
`integrity_failure`; no partial identity or trusted block escapes.

## Logical closure and prefix selection

Prompt binding requires non-empty interviewer source turns and candidate-only
response turns. Interviewer follow-up and explicit section transition close
the preceding block. The terminal boundary closes a block only for a complete
snapshot with `settled` writer authority.

Silence and `input_exhausted` remain grouping boundaries, not closure proof.
Missing settlement leaves the terminal block unverified. Once one block is not
trusted, that block and every later block are excluded, producing a
deterministic prefix rather than a selective suffix.

The exact `interviewer/no_provider_confirmed_prefix` marker is the sole
preserving marker by role and reason. It advances the shared sequence but
contains no speech evidence, so it neither closes nor splits the current
prompt-bound answer. It may repeat and may occur between speech events. Later
verified speech continues the same answer, which may become trusted only when
an accepted later boundary closes it. A preserving marker may keep the snapshot
partial and the projection at `verified_prefix`; zero excluded candidate blocks
may authorize complete scoring downstream. Candidate markers, every
canonicalization failure, timestamps
that precede already-sequenced speech, and other malformed preserving markers
fail closed, as do gaps, writer/cutoff conflicts, and replay conflicts.

## Trusted identity

The projection emits one `trusted-answer-block-identity.v1` per trusted block,
aligned one-to-one with the block and closure authority by `answerBlockId`.
The builder remains private, preventing callers from blessing arbitrary
`CandidateAnswerBlock` values.

Canonical SHA-256 material is a JSON tuple of identity version, ordinal,
normalized prompt text, normalized response text, outer response start/end,
and accepted closure kind. It omits fragment count and event/writer/sequence
identities, so semantically equivalent 1/2/5/10 segmentation retains the same
identity. Source events remain citation truth.

## Compatibility and calibration

Unknown authority versions fail closed; they never reinterpret legacy rows.
The existing grouper and current feedback generation are unchanged. The
`trusted-answer-block-calibration.v2` synthetic corpus covers segmentation,
repeated safe markers, terminal marker behavior, degraded writers, cutoff
safety, exact/conflicting replay, gaps, drift, canonicalization, and
historical-version rejection under its own SHA-256 binding. The historical v1
corpus and existing dimension calibration v1 remain immutable.
