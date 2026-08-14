# Design: Shadow feedback artifacts

## Dependency and authority direction

Core accepts only the private-minted SAV-441 trusted identity plus bounded
version labels. It never accepts transcript text as key authority. The database
adapter depends on core parsers; feedback generation and lifecycle readers do
not depend on the shadow store.

## Structural default-off gate

The server config parser mints an opaque context only for the exact server-only
`enabled` value and registers it in a module-private `WeakSet`. The write store
validates membership before artifact parsing or repository access. This makes
disabled zero-side-effect behavior and forged-context rejection observable in
provider-free tests.

## Immutable identity and stale fencing

The key fingerprint is SHA-256 over a canonical ordered tuple. Postgres enforces
both that fingerprint primary key and the expanded tuple unique constraint. The
store uses insert-on-conflict-do-nothing and compares the existing parsed value;
it never updates. A database trigger independently rejects row updates. Version
changes create new keys, and exact reads query only the currently expected key
fingerprints, leaving retired tuples stale.

## Content minimization

Completed values retain closed facet codes and nullable scores by dimension;
failed values retain one closed failure class. Bounded timing/token metrics are
allowed. Transcript/feedback prose, provider payloads and IDs, raw errors, user
identity fields beyond relational ownership, and billing data are forbidden.

## Privacy lifecycle

The table is forced-RLS service-only and correlated to both session and owner.
Account export strictly reparses and allowlists artifacts. Account deletion
removes rows before deleting the session graph. No new automatic expiry is
invented; a shorter policy requires a separate accepted retention decision.

## Compatibility

Migration 0039 is additive from exact predecessor 0038. Existing feedback rows,
verified-prefix contracts, lifecycle reads, UI, progress, insights, and billing
remain byte-for-byte outside this dependency direction. Unknown versions fail
closed at key, value, set-read, and export boundaries.
