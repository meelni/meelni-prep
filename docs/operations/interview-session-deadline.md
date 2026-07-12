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
5. At the deadline, confirm the session atomically stores terminal truth plus
   `deadline_room_cleanup_status=pending` before room deletion starts, then room
   participants are disconnected and cleanup is acknowledged before feedback
   dispatch. Feedback is queued or skipped according to durable signal.
6. Replay the deadline event and confirm the stored terminal result is unchanged.
7. Exercise a room-delete failure in a safe test environment; confirm terminal
   truth commits, `feedbackReady` remains false, feedback polling reports
   `settling`, direct retry is rejected, and the Inngest run retries deletion.
   While deletion is deferred, race an ordinary end command and confirm it
   preserves the pending claim and stored terminal owner; confirm the central
   feedback outbox refuses a claim until cleanup is acknowledged.
   Repeat with insufficient signal and confirm `not_required` remains blocked
   until cleanup acknowledgement. After acknowledgement, confirm eligible signal
   sends one feedback event, skipped signal sends none, and later replays send no
   duplicate.
8. Confirm the recovery cron emits a new delivery identity only for an overdue
   open session, any terminal session with
   `deadline_room_cleanup_status=pending`, or an acknowledged deadline-owned
   session whose eligible feedback dispatch remains retryable. Exhaust the exact
   event's retries and confirm recovery deletes the room, acknowledges the claim,
   and completes the dispatch/not-required boundary within the next five-minute
   recovery window. Then force dispatch failure after acknowledgement and confirm
   the next recovery sends one new outbox attempt without deleting the room again.
9. Create an isolated open voice-session fixture with a room name but no
   `started_at`. Confirm recovery immediately attempts room deletion, commits
   `provider_failure`, and retries with the safe room-deletion error code if the
   provider acknowledgement fails. This quarantine path also covers legacy
   rooms whose metadata cannot supply a usable deadline.

## Monitoring

Alert on:

- a nonterminal voice session whose derived deadline is in the past;
- `livekit_room_delete_failed` or exhausted deadline-function retries;
- deadline enforcement lateness above the product tolerance;
- repeated recovery scheduling for the same session;
- deadline-completed sessions without feedback rows;
- deadline-completed sessions with unacknowledged cleanup that expose feedback
  or remain `feedbackReady=false` after retries are exhausted;
- `session_deadline_unavailable` reads or invalid-session quarantine events;
- start failures caused by missing deadline scheduling acknowledgement.

Never log tokens, credentials, transcript text, customer identifiers, or room metadata payloads. Use redacted aggregate counts and safe correlation suffixes.

## Recovery And Rollback

- The exact event and recovery deliveries are idempotent at the completion and room adapter boundaries. It is safe to replay a due deadline.
- Do not reopen a terminal session or rewrite its first terminal reason.
- If Inngest is unavailable, restore it and run the recovery function; do not bypass the deadline by returning room credentials.
- If LiveKit deletion fails, retry deletion. Do not reverse committed terminal
  truth or feedback intent, and do not dispatch or expose feedback before an
  acknowledged `deleted` or `already_absent` result.
- If feedback dispatch fails after cleanup acknowledgement, leave the outbox
  retryable. The five-minute deadline recovery scan and authenticated direct
  retry both use the same idempotent claim; neither repeats room deletion.
- An open voice room without a valid persisted start time is invalid, not
  deadline-exempt. Quarantine it, delete the room, and terminalize it as
  `provider_failure`; never silently omit it from recovery.
- Migration `0008_deadline_room_cleanup_ack.sql` is additive and backfills
  existing explicit `time_limit` sessions to `pending`. New accepted deadline
  commands persist the independent claim even when validation refines the
  terminal reason to `insufficient_signal`; historical refined rows cannot be
  attributed to a deadline safely and are not guessed by the backfill. Keep the
  migration applied during rollback.
- Roll back application code only with the relaunch flag still off. Keep additive lifecycle and completion schema in place.
