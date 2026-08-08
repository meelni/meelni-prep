# Design

## Continuous writer progress

`transcript_runtime_writer` gains an additive version-1 progress tuple:

- `last_observed_sequence`: highest terminal sequence fact stored for the writer;
- `committed_sequence`: highest gap-free prefix beginning at sequence 1;
- `committed_event_id` and `committed_through_at`: identity and measured time at
  the committed boundary, null only when the committed sequence is zero;
- `integrity_state`: `healthy` or `degraded`;
- `progress_updated_at`: database time of the latest progress convergence.

The turn/marker transaction locks the same session row as terminalization.
In-order evidence advances in constant work. An event beyond a gap updates only
the observed sequence. When the missing sequence arrives, a bounded scan of the
already-persisted suffix advances to the next gap. An interruption marker makes
the writer degraded and can never become evaluation text. A turn and marker may
not claim the same writer sequence.

Runtime settlement is still valuable proof of an exact drain boundary. A
`settled` assertion is accepted only when database progress is healthy and
gap-free; it does not create or infer transcript rows.

## Frozen terminal evidence

The session records one versioned tuple: semantic cutoff, evidence state, and
freeze time. `transcript_evidence_writer_cutoff` stores the copied progress and
normalized settlement state for every registered generation. It references the
durable writer identity and is immutable after terminal commit.

Classification is deterministic:

1. `degraded`: no registered writer, any marker/degraded writer, any observed
   gap, malformed boundary, or degraded settlement;
2. `insufficient`: the healthy committed prefix does not meet the canonical
   partial threshold (5 turns, 5 measured minutes, 3 substantive candidate
   responses);
3. `complete`: the prefix is eligible and every generation has `settled` proof
   no later than the terminal cutoff (the active ending generation is
   constrained to the exact terminal cutoff, while fenced generations retain
   their earlier handoff cutoff);
4. `partial`: the prefix is eligible and healthy/gap-free, but one or more
   generations lack settlement proof.

Complete evidence preserves the validator's full/partial tier. Partial evidence
always requests `partial` evaluation even when its observed duration would
otherwise qualify as full. This prevents the model and UI from implying that an
unproven tail was available.

## Evaluation read

New feedback jobs read the session snapshot, then select only turns whose
writer identity matches a frozen row, `sequence <= committed_sequence`, and
`ended_at <= transcript_cutoff_at`. The query remains bounded by the 1,000-turn
session contract. Snapshot state and the committed completion tier must agree.

Pre-migration terminal sessions have a null snapshot tuple. They retain a
bounded legacy read so rolling deployment and repair remain possible. New
terminal sessions must never silently fall back after snapshot creation fails;
the entire terminal transaction rolls back.

## Migration and rollback

Migration `0030` adds the writer progress columns, terminal snapshot tuple, and
server-only cutoff table. Existing writer progress is backfilled from the union
of durable turns and integrity markers; gaps remain visible and any marker or
cross-kind sequence collision marks the writer degraded. Existing terminal
sessions remain legacy rather than retroactively asserting a cutoff.

Rollback leaves the additive data in place and can return application reads to
the legacy path. Frozen cutoffs and writer progress are not deleted or rewritten.

## Provider assumptions

LiveKit documents `conversation_item_added` as the committed chat-history event
for both user and agent messages, including interruption state and per-turn
metrics. Reliable data packets are ordered/retried but not indefinitely buffered,
so the database acknowledgement—not room delivery—remains the durability signal.

References:

- <https://docs.livekit.io/reference/agents/events/>
- <https://docs.livekit.io/deploy/observability/data/>
- <https://docs.livekit.io/transport/data/packets/>
