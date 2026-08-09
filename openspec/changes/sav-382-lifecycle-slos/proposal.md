# Proposal: Bounded interview lifecycle states and SLOs

## Problem

The system persists durable interview and feedback state, but two states can
still strand the user behind generic loading copy: an accepted user end whose
background event was lost, and a feedback event acknowledged by the queue but
never claimed by a worker. Existing telemetry records local function duration,
not a consistent SLO classification.

## Outcome

Every post-interview phase is explicitly normal, delayed, recoverable, or
terminal. Stale states have a safe retry owner and stable fencing identity.
Operations can aggregate latency and breaches without customer content.

## Non-goals

- Replacing Inngest, LiveKit, Postgres, or the observability stack.
- Retrying an actively claimed feedback evaluation before its lease expires.
- Enabling Production alerts or changing launch state.
