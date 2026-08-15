# Runtime Transcript Ingest

The LiveKit interview runtime is the only canonical transcript writer. The
candidate browser displays acknowledged events and hydrates durable history; it
never stores or submits raw transcript retry payloads.

## Authentication

The runtime posts the exact compact JSON body to
`/api/internal/transcript` with:

- `x-meelni-timestamp`: ten-digit epoch seconds
- `x-meelni-signature`: lowercase HMAC-SHA256 hex

Both services derive a domain-separated signing key using context
`meelni/transcript-ingest/v1`, then sign `<timestamp>.<raw-body>`. The web
verifier uses its server-only `LIVEKIT_API_SECRET`. LiveKit Cloud generates a
distinct provider credential for each deployed agent, so the Production
runtime receives the web environment's value through the dedicated
`MEELNI_TRANSCRIPT_INGEST_SECRET` deployment secret. Local and Preview runtimes
may fall back to their `LIVEKIT_API_SECRET`. Requests outside the five-minute clock window,
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
- Writer-registration timeout, rejection, or missing signing configuration is
  a pre-output fatal boundary. The runtime disables input, closes any local
  session, deletes the room, and shuts down before attempting a bounded direct
  signed `runtime_writer_registration_failed` lifecycle report that does not
  require a registered writer. The web transaction terminalizes the session,
  preserves cleanup intent, and releases an active reservation or refunds a
  consumed provider-fault reservation idempotently. If no signing authority is
  available, room deletion still completes first; the one-minute authoritative
  presence scan observes the absent startup room and performs the same terminal
  credit convergence without treating a transient younger absence as failure.
- The outbox is process-local, memory-only, and bounded at 1,000 identities.
  It reserves one control slot for mandatory settlement; transcript data cannot
  consume that capacity.
- Stable event identity makes 2xx-created and 2xx-existing acknowledgements
  equivalent.
- Turns and integrity markers share one writer-scoped monotonic sequence
  allocator. The Python allocator test produces the checked-in 6m14s golden
  identity/sequence contract, and the TypeScript fixture consumes that exact
  contract through the real Drizzle transcript and marker stores in disposable
  PostgreSQL. Python and TypeScript remain separate processes, so this shared
  contract plus the database persistence seam is the intentional cross-language
  boundary; no test claims an in-process Python-to-TypeScript call.
- Network failures and HTTP 408/425/429/5xx retry; other statuses become
  permanent integrity failures.
- Transcript text is published to the LiveKit room only after durable 2xx. The
  ingest acknowledgement's durable `row_id` is added to that post-persistence
  display notification so live rendering and durable hydration use the same
  stable row identity and final ordering.
- Explicit end atomically records `ending/user_end` and `ending_at`; a
  recoverable background server worker sends a reliable metadata-only packet
  to the current writer generation's exact provider-owned agent identity while
  the browser token retains `canPublishData=false`. The writer UUID is never a
  participant target. Prefer one active kind-4 room participant; when that
  projection is absent or lacks name correlation, accept only one exact-room
  dispatch matching `LIVEKIT_INTERVIEW_AGENT_NAME`, with one running job and a
  bounded provider participant identity. Require exact job/dispatch linkage,
  room job type, room and agent names, `deletedAt == 0`, `endedAt == 0`, and no
  publisher-only participant projection. Every non-deleted room dispatch must
  contain exactly one job. Explicitly deleted dispatches may omit retired jobs;
  separate structurally valid completed dispatch jobs are ignored as history. A projected
  wrong name or identity mismatch and any ambiguity fail closed. Re-read the
  same durable writer generation before sending. The runtime installs the
  cutoff-aware evidence gate, disables input and output, and force-interrupts
  all current/queued generation before asynchronous drain. During drain only a
  canonical candidate or confirmed interviewer turn measured at or before the
  cutoff may enqueue. A marker requires an explicit trustworthy occurrence;
  pre-drain scheduled interviewer speech interrupted by End may emit its one
  no-prefix marker at the exact cutoff. This preserves a deliberate in-progress
  candidate commit and confirmed heard prefix. Unmeasured, post-cutoff,
  post-gate, or post-settlement callbacks are rejected locally rather than
  submitted to the closed web session. Every
  registered writer generation must have durable `settled` proof; missing or
  degraded proof fails closed.
- Runtime settlement observability is a closed identity-free schema. Web stages
  are `target_resolution`, `generation_recheck`, `packet_send`, and
  `durable_ack`; agent stages are `packet_validation`, `local_fence`, `drain`,
  and `settlement_persist`. Both carry only fixed source/outcome/reason,
  duration, and version. The web event additionally carries `occurredAt` and an
  allowlisted web release SHA. Runtime stages are correlated to the separately
  verified provider version and its `meelni.source_sha`; Python does not invent
  or emit that SHA. Never add room, session, user,
  writer, dispatch, job, participant, request, transcript, provider payload, or
  arbitrary exception fields.
- Explicit End atomically records a version-1 service-only settlement command
  with its lifecycle version, semantic cutoff, room, writer ID, writer
  generation, deterministic command ID, and bounded expiry. The signed ingest
  endpoint accepts strict content-free pull and acknowledgement envelopes. Pull
  returns only an exact generation match; acknowledgement requires the matching
  durable settlement row and outcome. Replays converge and stale, expired,
  conflicting, or unknown-version messages fail closed.
- The LiveKit packet is a wake-up hint derived from that command. Packet target
  resolution or delivery failure does not end the durable wait. The Python
  runtime also pulls on exact candidate disconnect and shutdown, then installs
  the same immutable cutoff fence before draining. Legacy writers remain safe
  during rollout because their matching `runtime_settlement` insert
  acknowledges the command transactionally.
- While `ending/user_end`, turns and interruption markers measured at or before
  `ending_at` remain admissible and the writer settlement must equal
  `ending_at` exactly. Later evidence is rejected. The session row is the
  durable outbox if immediate background-event delivery fails.
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
- Explicit end first gives a live background flush 250ms to quiesce, then
  cancels and awaits it before foreground replay. Candidate/interviewer speech
  settlement, evidence flush, and settlement persistence have a combined
  4.5-second stage budget under the server's five-second wait. Room transcript
  and status projection are separately bounded best-effort notifications and
  never retain durable queue ownership.
- If a shielded evidence transport remains hung after quiescence, the queue
  retains that single in-flight attempt but prioritizes its reserved
  metadata-only settlement item. This permits a durable degraded acknowledgement
  inside the control deadline without a duplicate evidence POST; later flushes
  may finish the retained request.
- Shutdown first pulls durable settlement work, then fences new dispatch, gives
  active settlement tasks a 20-second join, serializes through the same lock,
  and performs the final queue drain. A hard process crash can still lose
  in-memory pending work; the command expires and feedback eligibility fails
  safe when evidence cannot be proven.

## Deployment and rehearsal

1. Keep `MEELNI_REACTIVATION_DEFAULT=false` and the Statsig relaunch gate off.
2. Apply the complete committed chain through
   `0040_sav_448_managed_service_role_grants` and require the forty-one-entry schema
   preflight.
3. Deploy the web route and room-metadata writer before the Python runtime.
4. Deploy the Python runtime through the guarded wrapper with an external,
   owner-only secrets file containing
   `MEELNI_TRANSCRIPT_INGEST_SECRET=<web LIVEKIT_API_SECRET>`. The authorization
   target binds the secret snapshot's SHA-256 without exposing its value. The
   wrapper builds from the exact authorized Git commit and labels the LiveKit
   version with `meelni.source_sha`; require an exact attribute match before
   opening a test room.
5. In an isolated Preview environment, verify completed speech, mid-sentence
   interruption, zero-prefix interruption, transient 503, conflict, overflow,
   reserved settlement capacity at a full data queue, explicit end, tab close,
   logout, reload, and reconnect.
6. Confirm local/session/IndexedDB storage contains no transcript text or retired
   queue payload after bootstrap and sign-out.
7. Confirm PostHog and Statsig replay/autocapture remain disabled and
   console/runtime logs contain only safe identities and status codes.
8. Confirm both LiveKit runtimes call `AgentSession.start(record=False)` so
   provider observability does not upload audio, transcripts, traces, or logs.
9. Confirm every audible writer registers before output. Exercise replacement
   writer A plus writer B: feedback remains ineligible when A is missing or
   degraded even if B is settled; it becomes eligible only when all registered
   generations are settled and no marker exists.
10. Confirm explicit end atomically creates the writer-bound command, returns
    without a mounted browser dependency, and treats a trusted server-authored
    packet as a wake-up hint while the participant grant keeps
    `canPublishData=false`. Drop that packet and confirm shutdown/disconnect
    pull still disables audio input, commits active user speech, drains the
    outbox, persists writer-scoped `runtime_settlement`, and acknowledges the
    same command.
    Exercise RoomService projection absence plus real AgentDispatch protobuf
    history/current objects and confirm the exact current target succeeds. Then
    inject ambiguity and malformed defaults and confirm no packet is sent.
    Deliver measured candidate and confirmed interviewer callbacks immediately
    before and at the cutoff; confirm they persist before the metadata-only
    settlement. Confirm pre-drain interrupted interviewer speech emits one
    no-prefix marker at `D`. Then confirm unmeasured or `D + 1ms` turns, a
    post-gate speech handle, duplicates, and post-settlement callbacks cannot
    create an extra HTTP request.
11. Confirm reconnect timeout delivers a targeted request/ack while the room is
    live, records the durable settlement outcome, and deletes the room only
    afterward. A dropped request or missing acknowledgement must fail closed.
12. At the hard deadline, confirm the runtime stops input and output at `D`,
    rejects evidence at `D + 1ms`, and persists settlement within the server's
    20-second cleanup grace. The grace delays provider room cleanup only; it
    does not extend interview audio or change `settled_at = D`.

The isolated `meelni-preview` Supabase project now has a distinct project
identity and is connected to `meelni/meelni-prep`. Isolation is only the safety
prerequisite: the twenty-nine-entry migration preflight, application deployment,
matching LiveKit runtime configuration, and this end-to-end rehearsal still
need recorded Preview evidence before the relaunch gate can change.

## Rotation and rollback

Rotate the web `LIVEKIT_API_SECRET` and the agent's
`MEELNI_TRANSCRIPT_INGEST_SECRET` together. During mismatch, runtime ingest
returns unauthorized and the outbox retries only when the status is retryable;
keep the relaunch gate off until both sides converge.

Rollback may leave the additive marker table and policies in place. Do not
restore browser transcript-write endpoints, browser raw persistence, public
transcript writes, or unmasked session replay. If the runtime writer is
unavailable, pause new interviews and keep relaunch disabled. A failed
pre-output registration must leave no room accepting media and no active
reservation past the missing-room recovery window.

Deploy the transcript chain from `0011_transcript_ingest` through
`0013_runtime_settlement`, the web ingest/finalization code, and the voice
runtime as one gated rollout. Sessions from a runtime that cannot register and
settle its writer evidence are intentionally ineligible for feedback. Keep the
relaunch flag off until a new Preview session proves the complete boundary.
