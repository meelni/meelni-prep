# SAV-383 durable interview finalizer

## Why

The explicit user-end worker currently places runtime settlement,
terminalization, feedback dispatch, cleanup scheduling, and credit convergence
inside one durable step. Internal catches convert some failures to deferred
results, so Inngest cannot retry the failed operation independently. Once a
session becomes terminal, the user-end recovery scan also stops selecting it,
even if eligible feedback was never dispatched.

## Outcome

Every post-acceptance operation has a stable durable checkpoint. Successful
siblings remain memoized when another operation fails, and the recovery scan
re-enqueues both stale accepted endings and terminal retryable feedback outboxes.

## Boundaries

- Session lifecycle and feedback outbox state remain canonical.
- Transcript integrity and feedback eligibility remain fail closed.
- No rubric, prompt, scoring, or Production rollout change is authorized.
