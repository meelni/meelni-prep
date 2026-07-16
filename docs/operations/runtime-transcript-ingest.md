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

- Every runtime persists `runtime_writer_registration` before audible output
  and uses the returned `writer_generation` on all turns, markers, and its
  writer-scoped settlement. A replacement generation fences older writers but
  does not remove their settlement obligations.
- The outbox is process-local, memory-only, and bounded at 1,000 identities.
  It reserves one control slot for mandatory settlement; transcript data cannot
  consume that capacity.
- Stable event identity makes 2xx-created and 2xx-existing acknowledgements
  equivalent.
- Network failures and HTTP 408/425/429/5xx retry; other statuses become
  permanent integrity failures.
- Transcript text is published to the LiveKit room only after durable 2xx. The
  ingest acknowledgement's durable `row_id` is added to that post-persistence
  display notification so live rendering and durable hydration use the same
  stable row identity and final ordering.
- Explicit end calls the runtime settlement RPC. Active playout is interrupted,
  the exact heard prefix or no-prefix marker is enqueued, and the outbox drains
  before application terminalization. Every registered writer generation must
  have durable `settled` proof; missing or degraded proof fails closed.
- Hard deadline uses semantic cutoff `D`: input and output stop at `D`, accepted
  event time cannot exceed `D`, and each writer's `settled_at` is `D` even when
  its durable acknowledgement arrives during the cleanup grace.
- Reconnect expiry claims and fences terminal ownership but keeps the room and
  runtime alive while the server sends a reliable, trusted metadata-only
  settlement request targeted to the current generation and cutoff. It awaits
  durable database acknowledgement or a bounded fail-closed result before room
  deletion. A passive sleep or drain delay is never settlement evidence.
- Exact duplicate settlement request identities are single-flight: concurrent
  packets share one task, a successful result replays without new work, and a
  failed or cancelled operation permits only one new retry. The 64-identity
  ledger bounds both request identity and retained task state.
- Shutdown first fences new settlement dispatch, gives the worst-case 17-second
  settlement operation a 20-second join, then cancels and awaits every
  straggler before the final queue drain. A hard process crash can still lose
  in-memory pending work; feedback eligibility and the relaunch gate fail safe
  when evidence cannot be proven.

## Deployment and rehearsal

1. Keep `MEELNI_REACTIVATION_DEFAULT=false` and the Statsig relaunch gate off.
2. Apply the complete committed chain through `0015_provider_credit_recovery`
   and require the sixteen-entry schema preflight.
3. Deploy the web route and room-metadata writer before the Python runtime.
4. Deploy the Python runtime with the same environment's `LIVEKIT_API_SECRET`.
5. In an isolated Preview environment, verify completed speech, mid-sentence
   interruption, zero-prefix interruption, transient 503, conflict, overflow,
   reserved settlement capacity at a full data queue, explicit end, tab close,
   logout, reload, and reconnect.
6. Confirm local/session/IndexedDB storage contains no transcript text or retired
   queue payload after bootstrap and sign-out.
7. Confirm PostHog replay masks all text and console/runtime logs contain only
   safe identities and status codes.
8. Confirm both LiveKit runtimes call `AgentSession.start(record=False)` so
   provider observability does not upload audio, transcripts, traces, or logs.
9. Confirm every audible writer registers before output. Exercise replacement
   writer A plus writer B: feedback remains ineligible when A is missing or
   degraded even if B is settled; it becomes eligible only when all registered
   generations are settled and no marker exists.
10. Confirm explicit end disables audio input, commits active user speech,
    drains the outbox, and persists writer-scoped `runtime_settlement` rows
    before the browser calls the terminal API.
11. Confirm reconnect timeout delivers a targeted request/ack while the room is
    live, records the durable settlement outcome, and deletes the room only
    afterward. A dropped request or missing acknowledgement must fail closed.
12. At the hard deadline, confirm the runtime stops input and output at `D`,
    rejects evidence at `D + 1ms`, and persists settlement within the server's
    20-second cleanup grace. The grace delays provider room cleanup only; it
    does not extend interview audio or change `settled_at = D`.

The isolated `meelni-preview` Supabase project now has a distinct project
identity and is connected to `meelni/meelni-prep`. Isolation is only the safety
prerequisite: the sixteen-entry migration preflight, application deployment,
matching LiveKit runtime configuration, and this end-to-end rehearsal still
need recorded Preview evidence before the relaunch gate can change.

## Rotation and rollback

Rotate the LiveKit API secret in the app and agent together. During mismatch,
runtime ingest returns unauthorized and the outbox retries only when the status
is retryable; keep the relaunch gate off until both sides converge.

Rollback may leave the additive marker table and policies in place. Do not
restore browser transcript-write endpoints, browser raw persistence, public
transcript writes, or unmasked session replay. If the runtime writer is
unavailable, pause new interviews and keep relaunch disabled.

Deploy the transcript chain from `0011_transcript_ingest` through
`0013_runtime_settlement`, the web ingest/finalization code, and the voice
runtime as one gated rollout. Sessions from a runtime that cannot register and
settle its writer evidence are intentionally ineligible for feedback. Keep the
relaunch flag off until a new Preview session proves the complete boundary.
