# Bound Public Voice Preview

Date: 2026-07-09

Status: accepted

Amended: 2026-08-13 by SAV-431 to replace the two-preview cooldown with a
ten-preview rolling allowance.

## Context

The anonymous landing-page voice experience created a new LiveKit room and dispatched a model-backed agent for every request. It had no shared abuse budget, trusted anonymous identity, replay fence, or global spend breaker. Its API described a 60-second demo while the web and Python runtimes ran for five minutes, and token TTL was incorrectly treated as a session-duration control.

The preview is an activation surface: it should prove live PM interview practice before signup without becoming an unmetered replacement for a full, credit-backed mock interview.

## Decision

- Present the anonymous experience as a **two-minute voice preview**: one PM-style practice question, a realistic follow-up, and one concise takeaway.
- Postgres is the authoritative spend boundary across serverless instances. Production allows at most 100 new previews per rolling 24 hours globally, 20 per IP per 24 hours with a 10-per-10-minute burst, and 10 per signed device per rolling 24 hours. Preview and Development use a 20-per-day global ceiling.
- Only one preview may be active for a signed device. A signed browser-session cookie maps to one durable reservation, one room, and at most one agent dispatch while that preview is active. It may mint one recovery token for the same active room. The shared database consumes that recovery allowance before token signing; a client cannot withhold an acknowledgement to reclaim or replay the allowance.
- When the two-minute active window ends, the web route rotates the signed session identity invisibly so the next request may consume another device allowance without waiting for the old 15-minute cookie to expire. Each new preview receives a random server-derived room name so a stale room cannot be reused across attempts.
- A zero-cost handshake commits valid device/session cookies before reservation or provider work. Losing or aborting that response can repeat only the handshake; once cost-bearing work begins, retries carry the same signed session and cannot create a second room.
- A signed 30-day device cookie and a trusted Vercel client IP are domain-separated with a dedicated HMAC secret before storage. Raw IPs, cookies, tokens, room names, transcripts, and question text are excluded from abuse logs and analytics.
- The LiveKit participant identity and room name are server-derived. Browser grants allow microphone publication and subscription only; data, camera, and screen publication are denied.
- The Python agent initiates immediate shutdown, awaits bounded local model/audio closure, and deletes the LiveKit room at the hard cap. Token TTL and empty/departure timeouts are reconnect and cleanup safety nets, not duration enforcement.
- Shared-authority failures fail closed with `503`. A server-confirmed provider startup failure marks the reservation failed and refunds exactly that reservation from the device, IP, and global allowance. Failures after a usable token has been issued still count because the server cannot safely prove that the preview was unused.
- Daily or shared budget exhaustion returns a typed `429` and `Retry-After`. An already-active preview returns a distinct typed `409`. Customer UI describes the ten-preview allowance or the current active preview directly and never exposes an internal cooldown concept.
- The cost-bearing endpoint resolves the server-side relaunch gate before any limiter or provider work, rejects cross-site/form posts, and stays unavailable while the relaunch default is off.
- Session replay is disabled across analytics providers. Transcript text is ephemeral UI state and must never enter replay, logs, or analytics payloads.
- Pseudonymous session and limiter rows are eligible for deletion 48 hours after session expiry or limiter inactivity. Rotation of the HMAC secret resets anonymous identity continuity and must be treated as an operations change.

## Consequences

- Database migration `0025_public_demo_limits` must land after `0024_runtime_settlement_reconciliation` and before dependent web code. Historical migration number 0008 is permanently retired; it was removed during the authorized Production repair because its original PR never merged.
- Each environment needs an independent 32-byte base64url `DEMO_ABUSE_HMAC_SECRET` before the preview endpoint can start.
- The relaunch feature flag remains default-off. Preview replay, limit, room deletion, and rollback checks are launch evidence, not reasons to bypass the broader readiness gate.
- A verified Vercel WAF/bot rule is required launch evidence for denial traffic; Postgres remains the provider-spend authority.

## Validation

- Database concurrency tests prove global, IP, device, and session behavior, and strict preflight fingerprints every abuse-control function definition and privilege.
- Workflow/provider tests prove authorization precedes LiveKit work, replays do not redispatch, grants are microphone-only, and failures clean up rooms.
- Python tests prove the warning and hard-stop contract.
- Database tests prove previews 1–10 are accepted for one signed device, the 11th is denied until the oldest rolling-window entry expires, expired active sessions rotate without provider work, and confirmed provider-start failures restore all three allowance counters.
- Browser verification covers distinct active-preview and daily-limit states, non-automatic retry, normal completion, unexpected disconnect, and accessible recovery actions.
