# Design

## Terminal ownership

The authenticated end route owns the complete explicit-end command:

1. Authenticate and validate the owned session identity.
2. Attempt voice-runtime settlement for a short, bounded interval.
3. Treat success, degraded acknowledgment, timeout, missing runtime, and
   provider unavailability as settlement observations—not authorization to
   accept or reject the user's end intent.
4. Atomically finalize from durable transcript, writer, interruption, and
   lifecycle evidence.
5. Skip feedback when that evidence is incomplete.
6. Start recoverable credit settlement, room cleanup, and feedback dispatch.
7. Return the stored terminal result.

The database finalizer remains the only source of terminal truth. A runtime
acknowledgment improves evidence quality but never owns whether a user may
leave.

## Browser behavior

The browser freezes new transcript display as soon as the candidate confirms
End Interview and calls only the end command. A transport-ambiguous response
enters the existing reconciliation loop because the command may have
committed. A definitive server storage failure may be retried, but does not
restart the voice interview or pretend settlement is still pending.

The browser does not call a separate settlement prerequisite and does not
require a connected `LiveKitRoom` callback in order to end.

## Settlement budget

The end route applies a short settlement budget so runtime health cannot
consume the whole request deadline. The existing agent settlement path may
continue draining after the server stops waiting. Finalization records missing
or degraded writer proof as an integrity fault and skips feedback.

This is intentionally different from hard-deadline and reconnect cleanup,
where the system owns the cutoff and may use a longer background settlement
window before deleting the room.

## Idempotency and races

- Duplicate browser clicks are locally fenced.
- Duplicate HTTP requests replay the atomic finalizer and existing feedback
  record.
- Already-terminal sessions return stored terminal truth.
- User end racing a deadline or reconnect finalizer converges through the
  lifecycle version and terminal database row.
- Room cleanup failure cannot turn committed terminal truth into an end error.

## Observability

Report metadata-only settlement outcomes (`settled`, `degraded`, `timed_out`,
`runtime_not_ready`, or `provider_unavailable`) with the owned session
correlation ID. Never include prompts, questions, transcript content, provider
messages, or secrets.
