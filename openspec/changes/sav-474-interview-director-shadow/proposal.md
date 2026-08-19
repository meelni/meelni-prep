# Change: Add A Read-Only Interview Director Shadow

## Why

The accepted adaptive-interviewer program needs evidence about whether deeper
asynchronous analysis would recommend a better next move. That evidence must be
collected without adding media-path latency or allowing advice to change the
current interview, transcript, feedback, or customer experience.

## What Changes

- Extend the typed Director recommendation with exact policy and adapter
  versions.
- Add bounded context, provider-neutral runner, in-memory session store,
  deterministic fake adapter, and privacy-safe trace/comparison contracts.
- Observe only after canonical transcript persistence through a one-way ignored
  status call.
- Construct the application observer default-off and without an adapter.
- Test speculative/final reconciliation, freshness, races, replay, reconnect,
  capacity, deadline, delivery comparison, settlement, and isolation with
  provider-free synthetic fixtures.

## Impact

- Affected spec: `stateful-interviewer-contracts`
- Affected code: shared Python Director domain, thin full-interview observer,
  shared recommendation contracts, and synthetic tests
- Providers/data: none; no provider/model calls, customer data, database, or
  durable Director storage
- Rollout: none; Preview, Production, default-on, influence, and launch remain
  owner-controlled future actions
