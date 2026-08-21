# Activate Preview Shadow Inside Trusted Staging

Status: accepted

## Decision

The signed Preview-shadow activation may execute inside the existing
deployment-protected staging endpoint when the local operator cannot export the
sensitive Preview database connection. The endpoint computes the activation
context from its exact Vercel Git SHA and immutable rollout digests, verifies
the reviewed Ed25519 owner artifact, and calls the existing durable one-use
activation workflow.

The request carries the external authorization, signed artifact and run-control
capability over the protected staging connection. It is bounded to 64 KiB,
closed-shape parsed, never logged, and retained only as hashes in PostgreSQL.
Infrastructure authentication is defense in depth; it does not replace the
owner signature or durable CAS.

## Consequences

- No database password is exported, reset or copied to an operator file.
- The local owner tool prepares the private request but cannot activate a run.
- Exact replay returns the committed run; divergent, stale, cross-SHA or
  malformed input fails closed.
- Existing worker admission/reconciliation and every LiveKit/Production gate
  remain separate and unchanged.
- The endpoint grants no influence, customer-data, default-on or launch
  authority and makes no LiveKit/model call.
