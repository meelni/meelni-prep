# Wire Preview Shadow Through Explicit Durable Admission

Status: accepted

Date: 2026-08-20

## Decision

Prepare the bounded Preview-shadow rehearsal through a dedicated, server-only
workflow that completes SAV-480 lease allocation before any LiveKit room or
agent dispatch construction. Carry the admitted lease and raw worker-evidence
capability only in exact LiveKit job metadata for the named worker. Do not put
either value in room metadata, participant metadata, logs, durable evidence, or
customer-visible output.

The Python side parses one closed job-metadata contract and constructs the
existing lease-bounded Preview runtime only when both a durable admission
verifier and transport factory are injected. The ordinary interview entrypoint
continues to construct the Director with `adapter=None`; no environment,
credential, provider, flag, or default factory is added.

LiveKit room construction may accept optional dispatch metadata. Existing
callers omit it. When supplied, reconciliation requires exactly one matching
named dispatch with byte-identical metadata, so an ambiguous retry cannot attach
different authority to an existing room.

Terminal receipts and stop-incomplete incidents are submitted through a
separate server facade with the explicit worker capability and current expected
run revision. This slice does not invent a background reconciler or weaken the
SAV-480 revision contract.

## Consequences

- The repository contains the testable pre-room and worker-bootstrap seams
  needed for a later live rehearsal.
- No customer interview, provider call, live room, deployment, or flag is
  enabled by merge.
- Stable raw capabilities remain explicit trusted caller material. They are not
  persisted in evidence and are not derived from an ambient secret.
- A separately authorized operations slice must inject the durable admission
  verifier, OpenAI transport, credentials, exact merged SHA/config, and one-use
  execution authority.
