# SAV-480 Durable Preview-Shadow Control Plane

## Why

The accepted Preview-shadow gate defines strict reference protocols, but it
intentionally cannot provide cross-process one-time activation, global spend
caps, authenticated worker evidence, or restart-safe recovery. A process-local
model is not sufficient for LiveKit Cloud workers or rolling deployments.

## What changes

- Authenticate a fresh exact Preview-shadow owner decision with one injected,
  domain-separated Ed25519 verifier and versioned public-key registry.
- Persist one activation/run, atomically allocate session leases before any
  room or worker construction, and enforce cohort caps in PostgreSQL.
- Authenticate and reconcile terminal receipts, stop-incomplete incidents,
  cohort stop events, and termination acknowledgements idempotently.
- Preserve conservative spend evidence through failures, restarts, stopped
  runs, and incomplete cleanup without double counting.

## What does not change

No app route or voice runtime consumes this control plane. Application
`adapter=None`, all flags off, deterministic speech/controller behavior,
transcript/feedback authority, provider and deployment state, Production,
default-on, and human-owned GO/NO-GO remain unchanged. No executable owner
approval is checked in.
