# Feedback Generation

Feedback generation is one idempotent workflow with durable dispatch and generation state stored on the session's single feedback row. API routes and Inngest functions are adapters; they do not write feedback results directly.

## State ownership

- Interview completion creates the row as `pending` or terminal `skipped` and commits the completion tier and dispatch state in the same transaction.
- The dispatcher is the only owner of `dispatchStatus`, `dispatchEventId`, attempts, and dispatch leases.
- The generation workflow is the only writer of generation status and evaluated feedback fields.
- Completed and skipped rows are immutable. Recovery never reopens them.

## Event fencing

Every dispatch attempt receives a distinct event ID. A worker may claim only a `pending` or `failed` row whose stored event ID exactly matches its event. Completion, skip, and failure are compare-and-set updates requiring all of:

1. the session ID;
2. `status = processing`;
3. the exact stored event ID.

A delayed provider response or failure callback from an older attempt therefore cannot overwrite a newer attempt or a terminal outcome.

## Retry and leases

Generation has a five-minute processing lease. Recovery may prepare only `failed` work or `processing` work whose lease is missing or expired. Preparation returns the row to `pending`, clears processing and dispatch lease timestamps, and marks dispatch failed so the dispatcher can allocate a fresh event ID.

Pending dispatches, failed dispatches, and expired sending leases can be dispatched. Active generation and active sending leases report `retryable: false`. Terminal results always report `retryable: false`.

Concurrent recovery calls are safe: preparation is conditional, dispatch claim is atomic, and callers converge on sent or in-progress state.

## Authorization and side effects

- The workflow verifies the session owner and exact event identity before transcript or provider work.
- Transcript evidence is normalized through the Feedback v2 trust boundary before evaluation.
- Insights are requested only after the completion compare-and-set applies. The insights event ID is stable for the session and generation event, so replay does not create a second update.
- A terminal session missing its feedback row can be repaired through the interview-completion workflow before dispatch.
- A session in `ending/user_end` is owned by the background end finalizer. The
  feedback API does not invoke repair while transcript settlement is in
  progress.
- A pending account-deletion tombstone blocks repair, evaluation, terminal writes, and downstream insights. Recovery reports the session as unavailable rather than recreating work.
- Recovery requires the completion tier committed during interview finalization. Missing legacy evidence is a non-retryable failure; it is never promoted to `full` by default.

## Client recovery contract

`GET /api/feedback/:sessionId` owns retry truth through its top-level
`retryable` field. Feedback clients do not infer recovery from nested dispatch
state. Missing feedback is retryable only for terminal sessions. Ending
sessions return `settling` and `retryable: false`; active sessions remain
`session_not_ended` and non-retryable.

Each mounted feedback client may automatically invoke authenticated `POST` recovery once when top-level `retryable` is true. Concurrent polls share that attempt, then continue within a 30-poll, three-second interval budget. A failed automatic attempt becomes an explicit user recovery action rather than an unbounded POST loop.

Every GET, recovery POST, and terminal refresh payload crosses the same runtime lifecycle decoder. Unknown statuses or malformed variants render an explicit unavailable state; they never fall through to an indefinite loading state.

Deadline-ended interviews whose room cleanup has not been acknowledged return `settling` with `retryable: false`. Clients poll that state only with `GET`; neither automatic nor manual recovery can dispatch feedback until cleanup settles.

Eligible user-ended feedback is dispatched before room cleanup and credit
convergence. Production evaluation requests cap output at 2,000 completion
tokens, use a 75-second SDK timeout, and disable SDK-level retries. Durable
worker retries own subsequent attempts so one provider call cannot silently
double the latency tail.

## Compatibility

Retired direct-generation endpoints remain explicit `410 Gone` tombstones. Legacy direct database writers are removed; read APIs remain compatible with stored Feedback v1 and Feedback v2 records.
