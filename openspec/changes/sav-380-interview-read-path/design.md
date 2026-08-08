# Design

## Browser ownership

The interview page hydrates the durable transcript once after the owned room is
authorized. Listening, thinking, speaking, and idle changes do not touch the
read path. A confirmed connection recovery advances an explicit resync
generation. Effect cleanup aborts the superseded request, and every request has
a short deadline.

Feedback GET, recovery POST, automatic-deadline terminal refresh, ambiguous-End
lifecycle reads, and idempotent End retries use the same bounded fetch
primitive. Effect cleanup aborts owned work. Polling schedules the next attempt
only after the current attempt settles, preserving one in-flight request per
mounted lifecycle client.

## Server deadlines

Supabase server fetches have a transport deadline. A retryable auth transport
error is not treated as an invalid user session. Customer read routes also
have an outer deadline. Their database work executes in a transaction with a
transaction-local statement timeout below the route limit. Dependency
deadlines return privacy-safe 503 responses with a short `Retry-After` header.

## Runtime database policy

The initial containment uses `SET LOCAL statement_timeout` inside each
interactive read transaction. This is compatible with Supabase transaction
pooling and cannot leak session state to another pooled client. Background
workflow writes retain their independent budgets. Future slices may split
interactive and background pools if observed workloads need different
connection policies.

## Observability and privacy

Responses and logs identify only the route class and retryability. Production
session IDs, user identities, transcript text, feedback content, raw provider
errors, and credentials are excluded.
