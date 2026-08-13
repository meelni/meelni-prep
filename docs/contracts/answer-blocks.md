# Candidate Answer Blocks

Status: version 1 derived core contract

## Purpose

Canonical transcript events remain Meelni's immutable integrity, evidence, and
citation ledger. Candidate answer blocks are a deterministic derived view that
binds an interviewer prompt or follow-up to one logically continuous candidate
response. They are the evaluation and presentation unit; they never replace,
rewrite, or persist over canonical events.

The public core entrypoint is `deriveCandidateAnswerBlocks`. It performs no
model or provider call, emits no telemetry, and accepts no provider-specific
payload. Callers pass the already ordered, canonical/security-prepared ledger
projection, including typed continuity-only projections for semantic replays.

## Source provenance

Every source turn in a block preserves the exact canonical:

- opaque `eventId`, `writerId`, `writerGeneration`, and `sequence`;
- speaker and finalized `text` plus its exact UTF-8 byte projection;
- measured start, end, and audio duration;
- section and delivery state.

The joined `promptText` and `responseText` trim edge whitespace and join
fragments with one space for deterministic reviewability only. They are not
citation text. Feedback provider input and frozen citation validation continue
to use the individually prepared canonical turns, their original event IDs,
and their exact text.

## Coalescing rule

Consecutive candidate finals coalesce only while all of these remain true:

1. the writer identity and generation are unchanged;
2. writer sequence is contiguous;
3. the speaker and section are unchanged;
4. measured same-speaker intervals do not overlap or reverse;
5. silence from the preceding end to the next start is at most 5,000 ms;
6. no integrity marker, cutoff, or end boundary intervenes.

Only a canonical turn that the existing trust boundary classifies as an exact
semantic replay of a previously accepted event is represented as a typed
`semantic_replay` continuity event. Its anchor is explicit. It may advance a
candidate block only with the same speaker, writer identity/generation,
contiguous sequence, and valid non-overlapping timing. It never enters block
text, evidence breadth, source provenance, or citations. Consequently inserting
authenticated exact replay rows cannot turn one answer into several blocks.

A non-exact replay-family omission is a typed `semantic_replay_boundary`: it
consumes its known ledger sequence but cannot bridge blocks. Because omitted
candidate speech, or an omitted prompt to which later candidate evidence could
bind, would otherwise change answer identity or breadth, that condition makes
the derived evaluation snapshot ineligible and degrades the workflow to zero
reviewability statistics. An interviewer-only transcript with no candidate
evidence remains `no_reviewable_answer`. A missing anchor,
identity/generation conflict, unknown sequence gap, overlap/reversal, or other
invalid continuity also fails closed. Replay projections still preserve
structural role, marker, cutoff, and end boundaries from the immutable ledger.

The derivation creates numbered, invocation-local identities such as
`answer-block:0001`. These identify a derived projection only; canonical event
IDs remain the durable evidence identities. The algorithm can form several
blocks in one session and must never create one session-wide transcript blob.

## Boundaries

The following close or separate blocks explicitly:

- interviewer follow-up and any speaker change;
- `no_provider_confirmed_prefix` interruption marker;
- canonicalization-failure marker or malformed canonical turn;
- writer identity/generation change, replay-family boundary, or sequence gap;
- section change;
- silence longer than 5,000 ms;
- invalid same-speaker overlap or disjoint reversed timing;
- session cutoff, session end, or input exhaustion.

User/interviewer speech may overlap in measured time under the transcript event
contract. That overlap is accepted but still forms a role boundary. Same-
speaker overlap cannot prove logically continuous finalized speech and fails
closed. Duplicate event IDs, any unknown writer-sequence gap or reversal,
malformed turns, and events after cutoff/end make the derivation ineligible.

## Observable workflow invariant

For equivalent semantic speech split across 1, 2, 5, or 10 adjacent canonical
candidate finals, the session validator produces the same:

- answer-block reviewability projection;
- completion statistics;
- completion tier; and
- feedback provider mode.

Canonical completion statistics count unique bound prompt groups plus answer
blocks as logical turns. Candidate turn count is answer-block count. Word count
uses joined logical prompt/response text, and duration uses the outer measured
extent. Evidence classification runs once per prepared answer block. It does
not infer support from punctuation, surface grammar, or transcript row count.

The feedback workflow still passes the exact prepared canonical event set to
the evaluator. Consequently different segmentation has different source event
IDs where the ledger differs, and citations always resolve to the exact
original IDs/text for that session rather than an answer-block alias.

## Integrity and compatibility

The existing canonical preparation boundary still owns malformed-event,
semantic-replay, trust, and prompt-injection handling. Joined block text crosses
that preparation boundary again so an unsafe instruction split across multiple
STT finals cannot bypass it. Only authenticated exact replay rows may advance
continuity without becoming evidence. Non-exact replay-family omissions make
the snapshot ineligible when they can affect candidate evidence or prompt
binding rather than producing countable boundaries, and unknown gaps fail
closed. Exact replay variants therefore preserve accepted canonical citations
and provider input and cannot manufacture block boundaries or inflate breadth,
tier, or provider mode. Non-exact or conflicting replay input from an eligible
snapshot never reaches the evaluator.

Historical persisted sessions with no canonical identity fields keep the
legacy row-based statistics path. A mixed or malformed canonical shape does not
fall back to legacy; it fails closed. No migration or citation rewrite is
required.

SAV-369 does not replace scoring policy. Unsupported rubric dimensions and
overall scores remain governed by the existing feedback contracts and must
never be fabricated. SAV-421 may consume only the small public reviewability
projection in its separately reviewed change.
