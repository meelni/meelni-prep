# Generic Preview LiveKit Capability

Date: 2026-08-09
Status: accepted
Owner: SAV-391

## Decision

Keep ordinary Vercel pull-request Preview, but define it as a web-only lane with LiveKit intentionally disabled. The only disabling identity is the Vercel-owned tuple:

```text
VERCEL=1
VERCEL_ENV=preview
VERCEL_TARGET_ENV=preview
```

`VERCEL_TARGET_ENV=staging` remains the trusted provider-backed rehearsal lane and retains exact isolated LiveKit identity plus read-only reachability checks. Production remains enabled and strict with its canonical identity. Local, partial, unknown, or contradictory identity never implies disablement and therefore stays strict.

## Runtime Contract

- One integration-package capability resolver owns the target decision.
- Generic Preview preflight emits an explicit intentional LiveKit skip and performs no LiveKit configuration parsing, client construction, or provider call.
- Voice routes return the same non-retryable `voice_unavailable_in_preview` response before authentication, credit checks, durable session mutation, provider configuration, or provider I/O.
- LiveKit-backed background functions skip before database/provider work.
- The full-interview launcher and public demo describe the web-only Preview truth and do not claim that the interviewer is starting.

## Security Consequences

- Production credentials cannot enable voice in generic Preview.
- Missing credentials, an application-owned switch, or an unreadable provider cannot masquerade as intentional disablement.
- Generic Preview never receives Production LiveKit credentials as a workaround.
- Staging and Production failures remain blocking rather than warnings.

## Rollback

Revert the shared capability boundary and its consumers together. Do not compensate by copying credentials, weakening provider identity checks, or changing staging/Production configuration.
