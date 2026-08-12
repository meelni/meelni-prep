# Design

## Exact provider normalization

RoomService accepts one active kind-4 participant only when its bounded identity
and configured `lk.agent.name` are exact. A malformed active kind-4 projection
poisons resolution; a different valid participant cannot hide it.

When presence is absent or the sole participant is unnamed, AgentDispatch may
authorize only one non-deleted exact-room/exact-agent dispatch with one current
job. A missing or blank configured agent name authorizes neither the participant
nor a dispatch lookup. The job must have nonblank IDs, exact dispatch linkage, `JT_ROOM`, exact
room and agent names, `JS_RUNNING`, `endedAt == 0`, a bounded participant
identity, and no publisher-only participant projection. Explicitly deleted
dispatches may omit retired jobs. Structurally valid terminal jobs with positive
`endedAt` are history only as separate one-job dispatches; malformed, pending, or
multiple current contenders make the result ambiguous or invalid.

## Generation and destination fence

The workflow reads the writer generation before provider lookup and immediately
again after exact target resolution. A replaced or missing generation sends
nothing; an already durable settlement returns canonical truth. Only the same
unsettled generation may receive a reliable packet through one exact
`destinationIdentities` entry.

## Synchronous local fence

The runtime validates the server-authored packet and exact request identity,
then calls the dispatcher's synchronous pre-start hook. That hook freezes the
queue cutoff, installs the production cutoff-aware evidence gate, disables
input/output, and interrupts speech before `asyncio.create_task` can run. While
drain remains open, only canonical candidate or confirmed interviewer turns
with measured end time at or before the exact cutoff are admitted. Integrity
markers require an explicit trustworthy occurrence at or before the cutoff;
scheduled interviewer speech registered before drain may emit its single
no-prefix marker at the exact cutoff when End interrupts it. Unmeasured,
post-cutoff, post-gate, and post-settlement callbacks never enqueue. This
preserves `commit_user_turn` and confirmed heard speech active at End without
allowing new evidence. A partial session-fence
failure leaves the cutoff gate active and starts no operation; an exact retry
repeats the unfinished session fence before one settlement operation.

## Privacy-safe stages

TypeScript emits only `target_resolution`, `generation_recheck`, `packet_send`,
and `durable_ack`. Python emits only `packet_validation`, `local_fence`,
`drain`, and `settlement_persist`. Version, fixed source/outcome/reason,
duration are the only shared fields. The web event also includes `occurredAt`
and an allowlisted web release SHA. The runtime event is correlated to the
provider-owned running version whose `meelni.source_sha` is verified separately;
it does not invent or emit a source SHA. Emission failure never changes
behavior.
