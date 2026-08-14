# SAV-443 saved-interview processing workspace

## Why

After a candidate ends an interview, the feedback route may spend bounded time
settling transcript evidence, waiting in the feedback queue, or generating the
review. The current transient surface mostly communicates work-in-progress and
does not keep the saved interview useful during that interval.

## Outcome

Transient feedback states show a strict saved-interview workspace with the
historical question and round, a truthful durable-stage explanation,
leave-and-return navigation, and access only to the immutable frozen transcript
prefix when server-owned readiness permits it.

## Boundaries

- Existing settlement and feedback rows remain lifecycle authority.
- Existing feedback attempt history remains observability only.
- The browser never receives a mutable/unverified transcript tail.
- The workspace carries no identity, room, content-bearing evidence, provider,
  raw error, or generation-event diagnostics.
- Score authority, evaluator behavior, provider behavior, and persistence do
  not change.
- No database migration, Production action, deployment, or default-on change is
  part of this slice.
