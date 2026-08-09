# Interview Session Completion Operations

The product contract is [Interview Session Completion](../contracts/interview-session-completion.md). This runbook covers rollout and recovery for migration `0007_atomic_session_completion`.

## Before Deploying

1. Run `npm run test:interview-resilience`, `npm run check:ci`, and
   `npm run build`. The named resilience contract binds committed terminal
   workflow truth, the end API response, ambiguous client reconciliation, and
   pending/processing feedback rendering. It must remain an explicit required
   CI step so a green lower-level test cannot hide a broken handoff.
2. Run `npm run test:database-migrations` against disposable PostgreSQL 17 with `MIGRATION_TEST_DATABASE_URL` pointing to a local `*_test` database.
3. Run `npm run db:preflight` against the explicitly selected Preview environment.
4. Confirm the preflight reports eight migrations after application and schema fingerprint `db50dd715e13bcc70277b98e182c743293d5e6681d30c3d1e84ec24813476500`.
5. Do not apply the migration to Production until Preview end-to-end evidence is recorded on SAV-188 and the relaunch flag remains off.

## Preview Rehearsal

Use an authenticated Preview account and complete these cases:

- sufficient interview: end once, then replay the end request; both responses must identify the same feedback record;
- double-submit: trigger concurrent end requests and verify one terminal lifecycle result;
- insufficient interview: verify `abandoned/insufficient_signal`, skipped feedback, and no dispatch event;
- writer replacement: register writer A then writer B; verify B's settled proof
  does not make feedback eligible while A is missing or degraded, and that all
  registered generations settled with no markers is required;
- full data queue: verify reserved control capacity still persists the mandatory
  writer-scoped settlement;
- dispatch interruption: make Inngest unavailable, end the session, verify HTTP 200 with retryable dispatch, restore Inngest, and use Queue Feedback;
- credit interruption: make credit convergence fail after terminal commit,
  verify HTTP 200 with pending feedback dispatch, then replay and confirm credit
  converges before the outbox is claimed;
- participant publish restriction: keep the interview token's
  `canPublishData=false`, verify End reaches the authenticated runtime-settlement
  endpoint, the server-authored request receives durable acknowledgement, and
  terminalization proceeds without a browser RPC timeout;
- terminal repair: seed or locate a safe test session that is terminal without feedback, retry feedback, and confirm lifecycle state/version do not change;
- client failure: make the end endpoint return non-2xx and confirm the room stays mounted with an announced retry message.

## Database Inspection

Use only redacted counts in logs or tickets. Never paste transcripts, customer identifiers, connection strings, or provider credentials.

Useful aggregate checks:

```sql
SELECT dispatch_status, count(*)
FROM feedback
GROUP BY dispatch_status
ORDER BY dispatch_status;

SELECT count(*) AS terminal_without_feedback
FROM interview_session s
LEFT JOIN feedback f ON f.session_id = s.id
WHERE s.lifecycle_state IN ('completed', 'abandoned', 'failed')
  AND f.id IS NULL;

SELECT count(*) AS stale_sending
FROM feedback
WHERE dispatch_status = 'sending'
  AND dispatch_claimed_at < now() - interval '2 minutes';
```

## Recovery

- `pending`: a sender has not claimed the event. Authenticated feedback `POST` may claim it.
- `sending`: wait for the two-minute lease. A later retry may reclaim an expired lease.
- `failed`: authenticated feedback `POST` retries the same event ID.
- `sent`: do not redispatch. Feedback generation owns pending/processing/completed/failed status from this point.
- `not_required`: no generation event exists. This covers skipped feedback and conservatively migrated legacy rows.

A stale sender cannot acknowledge a newer claim because acknowledgement must match the current dispatch-attempt fencing token.

## Alerts And Metrics

Alert on:

- increasing `failed` dispatch rows;
- `pending` or `sending` age above five minutes;
- terminal sessions without feedback;
- duplicate Inngest event identities;
- feedback pending/processing age above the product latency target;
- non-2xx end-session responses.
- terminal version-1 sessions with missing credit policy evidence;
- provider/integrity faults whose reservation is not refunded;
- user-fault sessions whose consumed reservation was unexpectedly refunded.
- registered writer generations without durable settled proof.

## Regression Ownership

`npm run test:interview-resilience` is the incident-derived contract for the
end-to-feedback handoff. It covers these invariants together:

- repeated bounded transcript flushes reuse one in-flight runtime delivery;
- dispatch failure cannot turn committed terminal truth into a failed End
  response;
- an automatic deadline hands `ending` or terminal lifecycle truth to the
  feedback route without waiting for `feedbackReady`;
- stalled automatic-deadline reads abort before the next bounded poll;
- an ambiguous End transport result converges through bounded durable session
  reads and an abortable idempotent retry;
- the End row lock and transaction expire below the acceptance SLO, the End
  route expires before the browser, and retryable auth/database contention is
  never reported as unauthorized;
- a stalled feedback event send fails the current fenced claim inside three
  seconds instead of waiting for the stale-sender lease;
- session ownership, lifecycle, and feedback readiness share one bounded
  transaction so a timed-out poll releases its database connection;
- the feedback route renders pending, processing, settling, failed, and
  recovery states instead of leaving the interview spinner mounted.

The `Unit and Contract Tests` CI lane runs this command by name for every
non-documentation code change. Keep the lower-level workflow, route, page, and
feedback tests in their normal suites as independent coverage; this named gate
exists to make ownership of the complete handoff visible in CI.

## Rollback

Keep migration `0007` applied; its columns and constraints are additive. Roll back application reads/writes only if necessary. Never remove populated dispatch evidence, decrement lifecycle versions, reopen terminal sessions, or enqueue historical `not_required` rows in bulk.
