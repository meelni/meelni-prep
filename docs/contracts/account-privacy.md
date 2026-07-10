# Account Privacy Contract

## Account export

`GET /api/user/export` requires a server-verified authenticated user and returns
one JSON attachment scoped to that user. The payload version is `1.0.0` and is
defined by `ACCOUNT_EXPORT_SCHEMA_VERSION` in `@meelni/core`.

The export includes:

- account identity, profile, preferences, and practice streak;
- mock interviews, selected questions, transcripts, and feedback;
- bookmarks, practice sets, achievements, and saved progress insights;
- subscription, usage, payment summaries, and credit-ledger summaries.

The export excludes:

- passwords, tokens, API keys, Supabase service-role credentials, and auth
  session material;
- Stripe, Supabase, and LiveKit resource identifiers that exist only for
  provider operations;
- raw Stripe webhook payloads, provider/admin errors, receipt URLs, metadata,
  idempotency keys, and background dispatch state;
- rate-limit state, deletion tombstones, one-way provider fingerprints, logs,
  and backup contents;
- other users and the full shared question bank.

The database adapter selects allowed fields rather than selecting whole rows and
then trying to remove sensitive values. User-authored/generated JSON is also
recursively stripped of sensitive operational key names before serialization.
The response is `private, no-store`, uses `nosniff`, and has a server-selected
attachment filename.

Generating an export is a read-only operation. It does not delete data or create
a durable export artifact on the server.

## Account deletion request

`POST /api/user/delete` accepts only the exact body:

```json
{ "confirmation": "DELETE" }
```

The route requires:

1. a user verified by server-side Supabase `getUser()`;
2. `last_sign_in_at` no more than ten minutes old at request time; and
3. the exact destructive confirmation.

Missing, invalid, future, or stale authentication timestamps fail closed with
HTTP `409` and `reauthentication_required`. The client must complete a fresh
sign-in and collect confirmation again. Client-provided timestamps, access-token
refresh time, and UI state are not authentication-freshness evidence.

After persistence:

- HTTP `202 deletion_requested` means the durable tombstone exists and cleanup
  was queued. It does not mean provider cleanup is complete.
- HTTP `202 deletion_retry_scheduled` means the durable tombstone exists but the
  initial enqueue failed; the recovery workflow owns automatic retry.
- A non-202 failure means the request was not confirmed as durable and the UI
  must offer a retry without claiming deletion.

The unconfirmed `DELETE` method returns `405`. Provider/admin error details are
never returned to the client or stored in the tombstone; only stable categories
are persisted.

## Retention boundary

The accepted durable-deletion decision retains completed tombstones containing
the user UUID, status/timestamps, attempts, and one-way provider fingerprints
until a separate retention decision approves removal. This contract does not
invent a deletion period for those records.

Payment processors, backups, security logs, and legally required records can
have separate retention obligations. Product copy must not promise immediate
erasure from every system or an exact retention period until owner/legal policy
defines it. The relaunch flag remains default-off independently of this
contract.
