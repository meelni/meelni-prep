# Runtime Transcript Ingest

The LiveKit interview runtime is the only canonical transcript writer. The
candidate browser displays acknowledged events and hydrates durable history; it
never stores or submits raw transcript retry payloads.

## Authentication

The runtime posts the exact compact JSON body to
`/api/internal/transcript` with:

- `x-meelni-timestamp`: ten-digit epoch seconds
- `x-meelni-signature`: lowercase HMAC-SHA256 hex

Both services derive a domain-separated signing key from the server-only
`LIVEKIT_API_SECRET` using context `meelni/transcript-ingest/v1`, then sign
`<timestamp>.<raw-body>`. Requests outside the five-minute clock window,
malformed signatures, weak/missing server configuration, or body mutation fail
closed. Never log the secret, signature, raw body, or transcript text.
The server reads the request as an abort-aware byte stream, cancels it as soon
as it exceeds 64 KiB, and never buffers an unbounded body even when
`Content-Length` is absent or false.

The room metadata contains the exact ingest URL. It must use HTTPS and the
literal `/api/internal/transcript` path without credentials, query, or fragment.
Loopback HTTP is accepted only for local development.

## Runtime behavior

- The outbox is process-local, memory-only, and bounded at 1,000 identities.
- Stable event identity makes 2xx-created and 2xx-existing acknowledgements
  equivalent.
- Network failures and HTTP 408/425/429/5xx retry; other statuses become
  permanent integrity failures.
- Transcript text is published to the LiveKit room only after durable 2xx.
- Explicit end calls the runtime settlement RPC. Active playout is interrupted,
  the exact heard prefix or no-prefix marker is enqueued, and the outbox drains
  before application terminalization.
- Shutdown and hard-deadline paths perform a bounded drain. A hard process crash
  can still lose in-memory pending work; feedback eligibility and the relaunch
  gate must fail safe when evidence cannot be proven.

## Deployment and rehearsal

1. Keep `MEELNI_REACTIVATION_DEFAULT=false` and the Statsig relaunch gate off.
2. Apply migration 0010 and require the eleven-entry schema preflight.
3. Deploy the web route and room-metadata writer before the Python runtime.
4. Deploy the Python runtime with the same environment's `LIVEKIT_API_SECRET`.
5. In an isolated Preview environment, verify completed speech, mid-sentence
   interruption, zero-prefix interruption, transient 503, conflict, overflow,
   explicit end, tab close, logout, reload, and reconnect.
6. Confirm local/session/IndexedDB storage contains no transcript text or retired
   queue payload after bootstrap and sign-out.
7. Confirm PostHog replay masks all text and console/runtime logs contain only
   safe identities and status codes.
8. Confirm both LiveKit runtimes call `AgentSession.start(record=False)` so
   provider observability does not upload audio, transcripts, traces, or logs.
9. Confirm explicit end disables audio input, commits active user speech,
   drains the outbox, and persists a `runtime_settlement` watermark before the
   browser calls the terminal API.
10. At the hard deadline, confirm the runtime stops input at the exact instant
    and persists settlement within the server's 20-second cleanup grace. The
    grace delays provider room cleanup only; it does not extend interview audio.

Preview currently points at Production data, so do not run this rehearsal until
SAV-226 provides an isolated Preview database and provider configuration.

## Rotation and rollback

Rotate the LiveKit API secret in the app and agent together. During mismatch,
runtime ingest returns unauthorized and the outbox retries only when the status
is retryable; keep the relaunch gate off until both sides converge.

Rollback may leave the additive marker table and policies in place. Do not
restore `/api/session/transcript`, browser raw persistence, public transcript
writes, or unmasked session replay. If the runtime writer is unavailable, pause
new interviews and keep relaunch disabled.

Deploy migration `0011`, the web ingest/finalization code, and the voice runtime
as one gated rollout. Sessions from a runtime that cannot write settlement are
intentionally ineligible for feedback. Keep the relaunch flag off until a new
Preview session proves the complete boundary.
