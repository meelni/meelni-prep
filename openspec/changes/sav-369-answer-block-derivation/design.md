# Design

## Core derivation

`packages/core` owns a pure derivation over ordered canonical turns, integrity
markers, cutoff, and session-end events. Each output block contains ordered
prompt and candidate source turns plus normalized joined text used only for
reviewability. Source objects preserve exact event/writer identities, sequence,
role, text bytes, measured timing, section, and delivery state.

Candidate finals coalesce across a maximum 5,000 ms silence only for the same
writer, generation, speaker, section, contiguous sequence, and non-overlapping
forward timing. A prompt/follow-up, role transition, interruption marker,
canonicalization failure, sequence gap, writer change, section change, longer
silence, same-speaker overlap, reversed interval, cutoff, or end closes the
current block. Cross-role timing overlap remains valid under the transcript
contract but is still a role boundary.

## Workflow integration

Canonical rows first cross the existing `prepareFeedbackTranscript` trust,
semantic-replay, malformed-event, and injection boundary. The session validator
derives answer blocks from that accepted projection and prepares each joined
candidate response again so controls split across adjacent finals remain
rejectable. Evidence classification and completion breadth run once per answer
block.

Canonical completion statistics use unique prompt groups and answer blocks as
logical turns. This makes the entire persisted `completionStats` shape stable
across equivalent 1/2/5/10 segmentation. Completion tier and provider mode are
therefore stable too. The feedback workflow deliberately keeps its evaluator
transcript input on exact individually prepared canonical turns; answer-block
IDs never become citation references.

## Compatibility and failure

When no row has canonical identity, session validation uses the historical
row-based calculation. Once any canonical identity is present, every required
version-2 provenance field must validate; malformed mixed data cannot use the
legacy path. Duplicate identity, invalid order/timing, injection, and events
after cutoff/end produce integrity degradation rather than reviewable evidence.

No database schema, provider selection format, scoring threshold, user-facing
feedback payload, or telemetry contract changes in this slice.

## Verification

Synthetic spoken PM fixtures split each of two answers into 1, 2, 5, and 10
canonical finals. Core tests compare reviewability, provenance, and boundaries.
The observable feedback workflow compares full completion statistics, tier,
provider mode, and exact canonical citation inputs. Adversarial coverage includes
follow-up, interruption/canonicalization marker, writer generation, sequence
gap/reversal, section, long silence, same- and cross-role overlap, cutoff/end,
replay, injection, malformed timing, and legacy persisted rows.
