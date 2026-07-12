# Interview Session Deadline Operations

The product contracts are [Interview Session Lifecycle](../contracts/interview-session-lifecycle.md)
and [Interview Session Completion](../contracts/interview-session-completion.md).

## Required Configuration

- LiveKit server URL, API key, and API secret for server-side room deletion.
- `LIVEKIT_INTERVIEW_AGENT_NAME` for the full interview worker.
- `INNGEST_EVENT_KEY` so start can receive provider acknowledgement for the scheduled deadline event.
- An isolated Preview database identity. Do not rehearse against Production data.

Session start fails closed and removes the room if the deadline event cannot be acknowledged. The user is not given room credentials for an interview without a server-owned deadline.

## Preview Rehearsal

Keep the relaunch feature default-off. With an authenticated Preview account:

1. Start a 15-minute voice interview and record only redacted session/room correlation identifiers.
2. Confirm the API response and room metadata carry the same canonical `deadline_at` derived from persisted `started_at`.
3. Confirm reconnect succeeds one millisecond before the deadline and is denied at the deadline.
4. Keep the browser visible for one run and background/close it for another.
5. At the deadline, confirm room participants are disconnected before feedback dispatch, the session stores `time_limit`, and feedback is queued or skipped according to durable signal.
6. Replay the deadline event and confirm the stored terminal result is unchanged.
7. Exercise a room-delete failure in a safe test environment; confirm terminal truth commits and the Inngest run retries deletion.
8. Confirm the recovery cron emits a new delivery identity only for an overdue
   open session and does not leave it open beyond the next five-minute recovery
   window. Future sessions must not accumulate duplicate scheduled deliveries.
9. Create an isolated open voice-session fixture with a room name but no
   `started_at`. Confirm recovery immediately attempts room deletion, commits
   `provider_failure`, and retries with the safe room-deletion error code if the
   provider acknowledgement fails. This quarantine path also covers legacy
   rooms whose metadata cannot supply a usable deadline.
10. Deliver one valid deadline event one millisecond early. Confirm the worker
    uses PostgreSQL time, returns `not_due`, and acknowledges a new durable
    delivery at the unchanged canonical deadline. At equality and +1
    millisecond, confirm the atomic state/version/derived-deadline claim stores
    `ending + time_limit` before room teardown.
11. Skew the application host clock both slow and fast, replay the event, and
    confirm the PostgreSQL claim and recovery query still select the same due
    rows and preserve the first terminal owner.

## Monitoring

Alert on:

- a nonterminal voice session whose derived deadline is in the past;
- `livekit_room_delete_failed` or exhausted deadline-function retries;
- deadline enforcement lateness above the product tolerance;
- repeated recovery scheduling for the same session;
- deadline-completed sessions without feedback rows;
- `session_deadline_unavailable` reads or invalid-session quarantine events;
- start failures caused by missing deadline scheduling acknowledgement.

Never log tokens, credentials, transcript text, customer identifiers, or room metadata payloads. Use redacted aggregate counts and safe correlation suffixes.

## Recovery And Rollback

- The exact event and recovery deliveries are idempotent at the completion and room adapter boundaries. It is safe to replay a due deadline.
- Do not reopen a terminal session or rewrite its first terminal reason.
- If Inngest is unavailable, restore it and run the recovery function; do not bypass the deadline by returning room credentials.
- If LiveKit deletion fails, retry deletion. Do not reverse committed terminal truth or feedback intent.
- An open voice room without a valid persisted start time is invalid, not
  deadline-exempt. Quarantine it, delete the room, and terminalize it as
  `provider_failure`; never silently omit it from recovery.
- Roll back application code only with the relaunch flag still off. Keep additive lifecycle and completion schema in place.
