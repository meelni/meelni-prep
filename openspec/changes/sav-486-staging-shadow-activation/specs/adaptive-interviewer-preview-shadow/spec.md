# Staging-Side Activation Delta

## Requirement: database authority stays server-side

The trusted staging server MAY accept the closed owner-signed activation
envelope and call the existing durable activation workflow. It MUST bind the
request to the exact deployed Git SHA, immutable configuration/selection
digests, stage `preview_shadow`, environment `preview_staging`, cohort `shadow`
and exposure `none`.

## Requirement: product authority remains cryptographic and durable

Deployment protection MUST NOT replace owner authentication. Every activation
MUST pass the existing Ed25519 verifier and one-use durable CAS. Exact replay
MAY return the committed receipt; divergent, malformed, stale or cross-boundary
input MUST fail closed.

## Requirement: no provider or later-stage authority

Activation MUST make no LiveKit/model call and MUST NOT grant Preview influence,
Production rollout, default-on, launch GO, customer data, room or deployment
authority. Existing worker admit/reconcile contracts remain unchanged.
