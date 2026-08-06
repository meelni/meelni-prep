# Design

## Durable acceptance

The authenticated end route performs one owner-scoped transaction. It either
claims `ending/user_end` with `endingAt` as the semantic cutoff or replays the
existing ending/terminal truth. The route schedules background work with a
strict delivery budget and returns without calling LiveKit, settling credits,
deleting a room, or waiting for feedback.

The lifecycle claim itself is the durable outbox. If immediate Inngest delivery
fails, a bounded recovery scan republishes stale `ending/user_end` sessions.

## Transcript settlement

While a session is `ending/user_end`, canonical turns and interruption markers
whose measured end is at or before `endingAt` remain admissible. Runtime writer
settlement must use exactly that cutoff. New writer registrations and evidence
after the cutoff remain rejected.

The server applies one outer settlement deadline across LiveKit presence,
reliable data delivery, and durable acknowledgement polling. The Python runtime
continues to drain its bounded outbox and persist either settled or degraded
proof. Missing proof fails closed after the background recovery window; it does
not keep the candidate in the room.

## Finalization and feedback

The worker finalizes from the locked canonical transcript snapshot. An invalid
provisional `user_end` claim may refine to `insufficient_signal` before the
terminal transition, just like other provisional cutoff-owned claims.

For an eligible completion, feedback dispatch starts immediately after terminal
truth commits. Credit convergence and ordinary room cleanup do not gate the
feedback outbox. All stages are idempotent; retries reuse lifecycle and feedback
fences.

## Client behavior

After durable acceptance the interview page unmounts the room and navigates to
the feedback lifecycle route. An `ending` session reports `settling` with no
client-triggered terminal repair. The status surface says the interview is
being saved, can be left safely, and links to Dashboard and Interview History.

Transport ambiguity before acceptance still uses bounded reconciliation. A
client deadline prevents an indefinitely pending fetch.

## Observability

Metadata-only stage events record acceptance, runtime settlement,
finalization/dispatch, credit convergence, and cleanup scheduling durations and
outcomes. Feedback records retain processing duration and gain no raw provider
or transcript diagnostics.
