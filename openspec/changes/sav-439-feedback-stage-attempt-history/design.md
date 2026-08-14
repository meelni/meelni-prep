# Design

## Authority and event fence

The feedback row remains the only authority for generation event identity and
terminal feedback state. The recorder accepts the raw internal dispatch event
only at its service boundary, locks the feedback row, and requires an exact
match. It then persists `v1:` followed by the lowercase SHA-256 digest of that
high-entropy event. The raw value is neither returned by normalization nor
written to the attempt table. This is an exact replay fence, not an analytics
identity and never a provider request ID.

## Closed immutable row

The unique logical key is feedback row, generation-event fence, one-indexed
workflow attempt, operation, and nullable provider attempt. `workflowAttempt`
is exactly the zero-indexed Inngest execution attempt plus one. The provider
attempt is a separate ordinal from one through three and exists only for
provider request/response operations.

Operations map to one closed stage. Outcomes and failure classes form a closed
compatible tuple. The failure taxonomy distinguishes deadline exhaustion,
transport timeout/network, provider rate/capacity, authentication,
configuration, refusal, schema, and contract failures, evidence integrity,
fencing, persistence, and internal failures.

An insert conflict is idempotent only when every normalized persisted field
matches the existing row. Any changed outcome, failure, timing, budget,
environment, or provider field fails closed as a divergent replay. The row is
therefore immutable without storing an open fingerprint or arbitrary metadata.

## Timing and provider context

Timestamps have millisecond precision and `durationMs` must equal
`completedAt - startedAt` exactly. Duration buckets are derived in the
normalizer and constrained to their exact database ranges. Duration, remaining
budget, and bounded retry delay cannot exceed the 90-second event budget.

Provider diagnostic kind, HTTP status, model, tier, usage, and retry delay are
closed contextual fields. They must all be null for non-provider operations.
Status requires a diagnostic kind. Retry-After may appear only on a retrying
provider request; a provider response cannot carry it. Usage is either one
complete bounded tuple or entirely null.

## Nonblocking delivery

The workflow accumulates normalized content-free inputs in memory while
authoritative work proceeds. Its `finally` block invokes the batch recorder
inside a promise callback so a synchronous throw becomes a rejected best-effort
flush. The one post-outcome flush has a 100-millisecond bound. A rejection,
divergent conflict, synchronous throw, or non-resolving promise cannot replace
the already-determined product result. This bound is outside the authoritative
90-second generation deadline. A row accepted by storage is durable; completion
after the 100-millisecond bound is not guaranteed when the serverless invocation
terminates.

The existing aggregate attempt event is unchanged and remains fallback
aggregate evidence when the durable batch is not accepted. It is neither
exact-event nor joinable history.

## Storage, privacy, and deletion

The additive table references feedback with `NO ACTION`, forces RLS, revokes
public and authenticated access, and grants only the service role the minimal
read/write/delete operations. There are no identity, session, room, content,
provider request, or raw error columns.

Account erasure locks the owned sessions and feedback rows, then deletes stage
attempt rows before feedback and session rows. This ordering both satisfies the
foreign key and prevents a concurrent recorder from recreating history after
the deletion transaction wins the relevant locks.

## Compatibility and rollback

Older application code ignores the additive table, and newer code tolerates a
missing or failed operations flush. Rolling compatibility therefore preserves
feedback and settlement truth in either direction. A rollback may leave dormant
service-only attempt rows; removing the table requires a later explicit
migration. Applying or removing it in Production is outside this change.
