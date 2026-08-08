# Proposal: Bound interview launch and canonical readiness

## Problem

The durable session-start workflow is idempotent, but its browser request has
no deadline. After LiveKit transport connects, canonical readiness performs
serial presence requests without per-request deadlines and maps retry
exhaustion to transport disconnection. A single dependency stall can therefore
leave the user waiting for the serverless ceiling or churn a healthy room.

## Outcome

Launch and readiness have explicit customer bounds. Provider-verified
activation remains authoritative, while delayed activation is represented as a
distinct recoverable state that never invalidates a connected transport.

## Non-goals

- Replacing LiveKit or weakening candidate-and-agent presence verification.
- Changing transcript, feedback, billing, or evaluation semantics.
- Enabling Production alerts, deployment, or relaunch state.
