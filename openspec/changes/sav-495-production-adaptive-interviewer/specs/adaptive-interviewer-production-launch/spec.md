# Adaptive Interviewer Production Launch Delta

## Requirements

### Signed pre-room admission

The Production start workflow SHALL create an exact session-bound adaptive
admission before LiveKit room construction only when the complete launch config
is valid. The worker SHALL fail closed before provider construction on any
missing, malformed, stale, cross-session, cross-room or digest-mismatched field.

### Bounded provider execution

An admitted Director attempt SHALL reserve conservative spend before I/O, use
zero retries and the exact direct Responses endpoint, and stop after ten attempts
or the session ceiling.

### Existing authority preservation

The Director SHALL remain advisory. The deterministic controller, fresh
lifecycle authority, delivery ledger, transcript persistence, feedback evaluator
and credit settlement SHALL retain their existing authority.

### All-off rollback

Removing the exact launch config SHALL make new sessions deterministic-only.
Disabling influence SHALL preserve the original tool fallback. No rollback SHALL
delete customer evidence or modify scoring policy.
