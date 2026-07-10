# Bound Public Voice Preview

Date: 2026-07-09
Status: accepted

## Context

The anonymous landing-page voice experience created a new LiveKit room and
dispatched a model-backed agent for every request. It had no shared abuse
budget, trusted anonymous identity, replay fence, or global spend breaker. Its
API described a 60-second demo while the web and Python runtimes ran for five
minutes, and token TTL was incorrectly treated as a session-duration control.

The preview is an activation surface: it should prove live PM interview
practice before signup without becoming an unmetered replacement for a full,
credit-backed mock interview.

## Decision

- Present the anonymous experience as a **two-minute voice preview**: one
  PM-style practice question, a realistic follow-up, and one concise takeaway.
- Postgres is the authoritative spend boundary across serverless instances.
  Production allows at most 100 new previews per rolling 24 hours globally,
  20 per IP per 24 hours with a 3-per-10-minute burst, and 2 per signed device
  per 24 hours. Preview and Development use a 20-per-day global ceiling.
- A signed, 15-minute browser-session cookie maps to one durable reservation,
  one room, and at most one agent dispatch. It may mint one recovery token for
  the same active room. That recovery is counted only after the browser connects
  and acknowledges its opaque claim receipt; an unacknowledged claim can be
  reclaimed after 30 seconds. Its authenticated server-side expiry is
  authoritative; replays never redispatch a ready or expired signed session.
- A signed 30-day device cookie and a trusted Vercel client IP are
  domain-separated with a dedicated HMAC secret before storage. Raw IPs,
  cookies, tokens, room names, transcripts, and question text are excluded from
  abuse logs and analytics.
- The LiveKit participant identity and room name are server-derived. Browser
  grants allow microphone publication and subscription only; data, camera,
  and screen publication are denied.
- The Python agent deletes the LiveKit room at the hard cap. Token TTL and
  empty/departure timeouts are reconnect and cleanup safety nets, not duration
  enforcement.
- Shared-authority failures fail closed with `503`. Budget exhaustion returns a
  typed `429`, `Retry-After`, and a recoverable cooldown UI.
- The cost-bearing endpoint resolves the server-side relaunch gate before any
  limiter or provider work, rejects cross-site/form posts, and stays unavailable
  while the relaunch default is off.
- Session replay is disabled across analytics providers. Transcript text is
  ephemeral UI state and must never enter replay, logs, or analytics payloads.
- Pseudonymous session and limiter rows are eligible for deletion 48 hours
  after session expiry or limiter inactivity. Rotation of the HMAC secret resets
  anonymous identity continuity and must be treated as an operations change.

## Consequences

- Database migration `0008_public_demo_limits` must land before dependent web
  code, after lifecycle migrations `0006` and `0007`.
- Each environment needs an independent 32-byte base64url
  `DEMO_ABUSE_HMAC_SECRET` before the preview endpoint can start.
- The relaunch feature flag remains default-off. Preview replay, limit, room
  deletion, and rollback checks are launch evidence, not reasons to bypass the
  broader readiness gate.
- A verified Vercel WAF/bot rule is required launch evidence for denial traffic;
  Postgres remains the provider-spend authority.

## Validation

- Database concurrency tests prove global, IP, device, and session behavior.
- Workflow/provider tests prove authorization precedes LiveKit work, replays do
  not redispatch, grants are microphone-only, and failures clean up rooms.
- Python tests prove the warning and hard-stop contract.
- Browser verification covers typed 429 cooldown, non-automatic retry, normal
  completion, unexpected disconnect, and accessible recovery actions.
