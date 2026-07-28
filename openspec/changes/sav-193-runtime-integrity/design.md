# Design

## Evidence ownership

The Python voice runtime is the only transcript writer. Before it may produce audible output, it registers a unique writer ID through the trusted ingest boundary and receives a positive, session-scoped generation. Transcript events, interruption markers, and settlement watermarks carry both identities.

A new registration supersedes the previous active generation. Supersession fences new events from the old generation but never erases its evidence obligation. Terminal feedback eligibility requires every registered generation to be settled, with no missing/degraded generation and no integrity marker.

## Cutoffs

Audio input and output stop at the semantic cutoff `D`. Cleanup may continue for a bounded grace, but events must describe media measured at or before `D`, and the watermark records `D`, not persistence wall time. Operational persistence time remains server metadata.

## Reconnect timeout sequence

1. Atomically claim the due reconnect generation and fence restoration.
2. Keep the room and runtime alive.
3. Send a reliable, metadata-only settlement request containing session, room, request identity, and cutoff.
4. Permit the registered generation to drain only pre-cutoff evidence while the session is ending.
5. Await durable settled/degraded evidence for a bounded interval.
6. Delete the room and finalize. Missing/degraded evidence becomes insufficient signal and never dispatches feedback.

Authenticated user end, the deadline path, and reconnect recovery send the same
trusted server-authored metadata-only request into one idempotent runtime flush
implementation. Participant tokens keep data publishing disabled; a timer or a
browser-to-agent RPC is never settlement evidence.

## Privacy and product truth

- Browser packets are post-persistence display notifications; the browser has no transcript write or retry queue.
- Runtime/application logs contain correlation, counts, states, and exception classes only—never questions, prompts, greetings, transcript text, error messages, or tracebacks from content-bearing paths.
- Transcript reads use one owner-authorized route with `Cache-Control: private, no-store`.
- Settings explain implemented transcript/audio behavior and do not present switches that the runtime ignores.

## Failure behavior

- Registration failure prevents audible output.
- Writer conflict, stale writer activity, queue overflow, missing acknowledgement, or degraded settlement fails closed.
- Room deletion still proceeds after a bounded settlement failure so reconnect cleanup cannot hang indefinitely.
- Retries are idempotent and cannot reopen terminal lifecycle state or duplicate feedback.
