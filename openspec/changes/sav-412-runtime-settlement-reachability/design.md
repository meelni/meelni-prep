# Design

## Exact target resolution

The durable current writer generation is required before provider lookup, but
its random `writer_id` is not a participant identity. RoomService remains the
primary source: exactly one joined/active kind-4 agent with the expected name
is accepted. When that participant projection is absent or lacks the name
attribute, the adapter reads AgentDispatch for the same exact room and accepts
only exactly one nonblank named dispatch with exactly one
`RUNNING` room job and one opaque nonblank participant identity of at most 256
UTF-8 bytes. The dispatch name must equal the configured interview agent name;
when a participant projection exists, its `lk.agent.name` and identity must not
conflict with that dispatch. Multiple active agents, dispatches, or jobs; a
different agent or room; non-running state; or invalid identity produce no
target.

The fallback uses the identity returned by provider job state verbatim. It does
not reconstruct the pinned SDK's default `agent-<job id>` identity and does not
change writer registration, generation, or replay keys. Existing runtimes with
random writer UUIDs therefore remain compatible across rolling deployment.

## Trusted End fence

After packet authentication plus exact session, room, generation, deadline, and
request-identity validation, the runtime synchronously:

1. installs the immutable semantic evidence cutoff;
2. disables audio input;
3. disables audio output; and
4. force-interrupts current, background, queued, preemptive, and realtime
   generation through `AgentSession.interrupt(force=True)`.

The asynchronous settlement task may then commit a measured in-flight prefix at
or before the cutoff. A callback measured after the cutoff is rejected locally;
it is not submitted to a terminal web route as an expected `409` and it marks
the settlement degraded through the existing post-cutoff fact.

## Bounded control acknowledgement

SAV-496 supersedes the original priority-lane behavior below after Production
proved it could close ingest ahead of usable pre-cutoff evidence. The reserved
slot remains, but settlement is now a terminal barrier behind unresolved
transcript, marker, and runtime-event items. A hung request leaves settlement
missing so the durable finalizer can freeze only the committed partial prefix.

The queue still reserves its final identity slot for runtime settlement.
Foreground settlement cancels and awaits the live flush while shielding its
single in-flight transport task. If that evidence request remains hung, the
reserved settlement stays pending rather than duplicating, discarding, or
overtaking the evidence request.

## Provider assumptions

LiveKit's room service accepts exact `destinationIdentities` for server data.
AgentDispatch exposes each job's state and `participantIdentity`, and room jobs
have at most one job. The pinned Python SDK publishes its accepted job identity
to LiveKit and `AgentSession.interrupt(force=True)` cancels current, background,
queued, preemptive, and realtime generation. LiveKit server defaults participant
identity length to 256 bytes.

References:

- <https://docs.livekit.io/transport/data/packets/>
- <https://docs.livekit.io/reference/agents/agent-dispatch-service-api/>
- <https://github.com/livekit/protocol/blob/main/protobufs/livekit_agent_dispatch.proto>
- <https://github.com/livekit/agents/blob/main/livekit-agents/livekit/agents/voice/agent_session.py>

## SAV-419 normalization amendment

Production proved the pre-send boundary: an active writer coexisted with target
resolution that returned no usable agent. Cleanup made the historical provider
projection unavailable. The original idealized fallback fixture did not cover
real pinned protobuf history/current projections, so SAV-419 supplies the
smallest Production-shaped amendment: only a structurally complete current room
job with exact default bigint state and linkage may authorize targeting;
malformed active projections remain visible and fail closed. It also rechecks
the durable generation before send and installs the exact cutoff-aware runtime
callback gate synchronously before creating settlement work. That gate permits
only canonical candidate or confirmed interviewer evidence measured at or
before the cutoff, plus explicitly timed integrity facts from pre-drain work,
then closes completely at settlement persistence.
