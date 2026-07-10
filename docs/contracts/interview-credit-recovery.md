# Interview Credit Recovery Contract

Status: locally verified; isolated Preview rehearsal is blocked by SAV-226.
This contract applies only to version-1 stable-start sessions. Version-0
sessions remain readable and are never given fabricated billing evidence.

## Fault Evidence

Terminal billing fault is machine-readable and separate from user-safe feedback
text:

- `user`: the candidate ended, reached the time limit, disconnected, or did not
  provide enough signal after the runtime had become usable;
- `provider`: the provider-neutral runtime reported a failed voice session;
- `integrity`: transcript settlement was missing or degraded, so Meelni cannot
  safely claim the paid interview was delivered.

Provider failure events use `interview.lifecycle.v1`, carry a stable event ID,
session ID, runtime reference, allowlisted failure code, retryability, and event
time, and arrive through the signed internal ingest endpoint. Raw provider error
messages, stack traces, tokens, or customer transcript content are forbidden.
The first accepted terminal claim is immutable; an equivalent replay is
idempotent and a conflicting claim fails closed.

## Versioned Billing Policy

Policy version `interview-credit-recovery.v1` resolves one terminal action:

| Durable state | Fault | Action | Candidate result |
| --- | --- | --- | --- |
| Reservation active | any | `release` | Reserved credit becomes available |
| Reservation consumed | provider or integrity | `refund` | Credit is restored |
| Reservation consumed | user | `retain` | Charge remains consumed |

Feedback dispatch, generation, scoring, and insight failures are not billing
faults and cannot change this table.

The action, reason, policy version, settled time, idempotency key, and optional
make-good grant ID commit together. Lock order is always owner lookup followed
by `app_user`, `interview_session`, reservation, allocations, and grants.
Concurrent commands and retries converge on one evidence tuple and one ledger
terminal history.

## Expired Source Make-Good

Refunding into an already expired grant would not restore a usable credit. In
that case the expired source remains consumed and the same transaction creates
one non-expiring `refund` grant for the affected allocation. Its deterministic
identity derives from the reservation, source grant, and policy version. Replay
validates the stored grant and transaction rather than issuing another credit.

## Recovery

A single-concurrency worker runs every five minutes and reads at most 250 rows
in stable order. It repairs:

- terminal version-1 sessions without settlement evidence; and
- nonterminal version-1 sessions whose active or consumed reservation is past
  the interview deadline plus settlement grace.

An expired nonterminal reservation is terminalized as a provider fault before
normal convergence. Active reservations release; consumed reservations refund.
Each candidate is rechecked under the canonical locks, so
stale scans and concurrent terminal commands become harmless no-ops. Provider
room cleanup remains independent durable intent and never delays credit repair.

## Support Evidence

Support may inspect session ID, lifecycle/terminal reason, billing fault and
fault code, policy version, action/reason, settlement time/idempotency key, and
make-good grant ID. Support tooling must not expose raw runtime exceptions,
room tokens, API secrets, recordings, or transcript contents.
