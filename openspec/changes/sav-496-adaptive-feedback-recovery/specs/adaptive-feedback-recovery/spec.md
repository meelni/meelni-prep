# Adaptive Interview And Feedback Recovery Delta

## Requirements

### Cross-service Production admission

The web and ordinary worker SHALL derive the Production admission signing key
from the explicitly synchronized cross-service root under an admission-only
domain. The worker SHALL NOT use its provider-injected LiveKit credential for
admission verification. Missing, malformed, stale, mismatched, or invalidly
signed admission SHALL fail closed before provider construction with a closed,
content-free reason.

### Single settlement interruption

The local settlement fence SHALL invoke one force interruption after applying
the evidence cutoff and disabling input/output. Speech settlement SHALL await
that same Future and SHALL NOT invoke a second interruption.

### Evidence-before-settlement barrier

Runtime settlement SHALL NOT be posted while an admissible pre-cutoff
transcript, interruption marker, or runtime event remains unresolved. Permanent
evidence failure MAY be followed by degraded settlement. A bounded unresolved
transport SHALL leave settlement missing rather than close ingest ahead of the
pending item.

### Feedback authority preservation

A healthy, gap-free committed prefix with missing settlement MAY authorize
scoreless Coaching review through the existing verified-prefix authority.
Candidate markers, canonicalization failure, sequence gaps, writer drift,
post-cutoff evidence, or permanent integrity failure SHALL remain `Unable to
review`. Numerical score authority SHALL NOT be broadened.
