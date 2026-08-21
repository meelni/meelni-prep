# Order Runtime Settlement Behind Transcript Evidence

Status: accepted

Date: 2026-08-21

## Decision

Production adaptive admission uses an admission-only key derived from the
explicitly synchronized web-to-worker transcript-ingest root. The worker's
LiveKit Cloud-injected project credential is never admission authority.

Runtime End installs one cutoff/input/output/interrupt fence. Later speech
settlement awaits that interruption rather than issuing another. The transcript
queue reserves terminal capacity but delivers runtime settlement only after no
transcript, interruption marker, or runtime event remains unresolved.

A permanently rejected evidence item may still produce durable degraded
settlement. A bounded hung transport may not be bypassed by settlement; the
server instead freezes the already committed writer prefix with missing
settlement. Existing trusted-prefix authority may then produce scoreless
Coaching review, while candidate-integrity failures remain `Unable to review`.

## Consequences

- New Production interviews no longer depend on equality between two
  provider-generated LiveKit credentials.
- A terminal settlement row cannot make a later admissible pre-cutoff turn
  receive `runtime_settled`.
- End remains bounded because the durable server command and partial snapshot
  do not require a settlement acknowledgement to finish terminalization.
- Numerical score authority, transcript truth, feedback schemas, credit
  settlement, and historical feedback rows remain unchanged.
- Secret convergence, deploy, smoke testing, and launch observation remain
  separate owner-authorized Production actions.
