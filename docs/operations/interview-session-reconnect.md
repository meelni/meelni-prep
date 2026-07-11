# Interview Session Reconnect Operations

The product contract is [Interview Session Lifecycle](../contracts/interview-session-lifecycle.md).

## Required Configuration

- LiveKit server URL, API key, and API secret.
- A LiveKit webhook targeting `POST /api/webhooks/livekit`, with
  `participant_joined`, `participant_left`, and
  `participant_connection_aborted` delivery enabled.
- `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` for reconnect scheduling and
  worker verification.
- An isolated Preview database and LiveKit project. Do not rehearse Preview
  reconnects against Production data.

The app verifies the raw webhook body with LiveKit's authorization header.
Never place an intermediary in front of the route that rewrites the body.

## Runtime Policy

- Reconnect grace: 30 seconds from the accepted server loss transition.
- LiveKit room departure timeout: 60 seconds.
- Agent behavior: keep the existing agent session open when the linked
  candidate disconnects.
- Resume behavior: use the same session ID and room, mint a fresh participant
  token with a maximum five-minute lifetime, and never reserve another credit
  or dispatch another agent. Decode the signed JWT and withhold it unless its
  actual `exp` is no later than the earlier reconnect or hard deadline.
- Hard deadline: continues during reconnect and wins when earlier than or equal
  to reconnect expiry.
- Every terminal path persists `room_cleanup_pending`; user end attempts
  deletion immediately, and a five-minute recovery scan retries until LiveKit
  acknowledges deletion or absence.

## Preview Rehearsal

Keep the relaunch flag default-off. After Preview isolation and Inngest keys are
ready:

1. Start one voice interview and record only redacted correlation suffixes.
2. Simulate a short network loss. Confirm `active → reconnecting → active`, the
   30-second deadline does not move, the timer continues, and the UI announces
   reconnecting then recovered.
3. Reload the page from a `?sessionId=...` URL. Confirm a fresh token joins the
   same room and agent; no second session, room, credit transaction, dispatch,
   or feedback row appears.
4. Repeat two drops. Replay the first restore and timeout deliveries; confirm
   the second lifecycle version remains authoritative.
5. Kill the tab and verify the signed webhook starts grace without a browser
   signal.
6. Stay disconnected through the exact deadline. Confirm one
   `disconnect_timeout` claim, room deletion, terminal session, and feedback
   intent. Replay the event and confirm no duplicate result.
7. Overlap a drop with the hard deadline. Confirm `time_limit` wins when its
   absolute deadline is earlier or equal.
8. Exercise a room-delete failure. Confirm the accepted timeout claim remains
   immutable and a retry completes deletion and settlement.
9. Race two retries with divergent durable-signal validation. Confirm the first
   completed or abandoned settlement remains immutable and the loser cannot
   rewrite `disconnect_timeout` or `insufficient_signal`.
10. Delay real LiveKit token signing across the computed TTL window. Confirm
    the adapter withholds a JWT whose actual `exp` exceeds the server-owned
    authorization deadline.

SAV-194 transcript event identity must be deployed before this ticket can be
declared launch-ready; repeated packets across reload must not create duplicate
durable turns.

## Monitoring And Rollback

Monitor redacted counts and latency for `active → reconnecting`, recovery,
timeout, stale provider events, lifecycle conflicts, webhook signature failure,
room deletion failure, and reconnect schedules recovered by cron. Alert on a
reconnecting row past its deadline, a claimed timeout stuck in `ending`, or a
terminal row whose reconnect cleanup marker remains set after the provider
recovery window.

Never log participant tokens, webhook bodies, room metadata, transcript text,
email, or provider credentials.

Rollback with the relaunch flag still off. Keep the additive schema and stored
lifecycle facts. Disable webhook delivery and reconnect reads only after open
sessions have terminalized; never decrement versions, extend existing grace,
or rewrite terminal reasons.
