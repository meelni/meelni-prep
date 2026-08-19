# Design: One-Way Asynchronous Shadow Observation

## Flow

1. The application resolves the exact disabled-by-default Director flag.
2. It constructs `InterviewDirectorShadowSession` with the SAV-471 read-only
   runtime-state projection and SAV-469 trace sink, but `adapter=None`.
3. After a transcript event is durably accepted, the existing publisher first
   reconciles SAV-471 and then calls the Director observer. It ignores the
   returned bounded status and independently projects the transcript to the
   room.
4. A future adapter may accept a bounded context off the media path. Only a
   finalized candidate source may materialize a recommendation. Speculative
   interim work reconciles by content digest or is discarded.
5. The session-local store validates version, session/writer/source authority,
   freshness, expiry, replay identity, capacity, and latest-by-source ordering.
6. Canonical delivery is compared by exact session, source turn/revision, move,
   and delivery identity without changing either side.
7. Settlement fences/cancels work; reconnect clears the old generation;
   shutdown drains cancellation before semantic telemetry closes.

## Structural isolation

The Director exposes observation, comparison, rollover, settlement, and bounded
shutdown methods. It exposes no speech, prompt, controller mutation, transcript
write, lifecycle, settlement write, evaluator, billing, account, secret, or
side-effecting tool dependency. The application reads no recommendation.

The global accepted move vocabulary is available only for counterfactual
shadow comparison while lifecycle is connecting/active/reconnecting, speech is
unfenced, and deadline time remains. SAV-471 may have an empty live allowed set
because its canonical move is pending; the shadow vocabulary does not confer
admission or generation authority. It closes at elapsed/terminal/non-active
fences.

## Bounds and privacy

Hard ceilings cover context turns/bytes, turn bytes, output bytes, reasoning
units, deadline, retries, concurrency, cost estimate, pending work, store
entries, and TTL. Errors use a closed content-free vocabulary.

Telemetry carries version, outcome, freshness, comparison category, move
category, latency/age, estimated micro-USD cost, and emission time only. Exact
session/source attribution remains in bounded local memory. No prompt,
transcript, quote, identity, provider/model name, tool payload, secret, or
reasoning is emitted.

## Compatibility and rollback

The flag accepts only exact `true`, defaults off, and remains insufficient
because the application injects no adapter. Removing or disabling the observer
does not migrate data. SAV-475 must define a separate influence path; this
change cannot be promoted into one by configuration alone.
