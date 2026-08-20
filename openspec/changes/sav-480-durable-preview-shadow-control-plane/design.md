# Design

## Authority layers

The server facade accepts the SAV-479 authorization plus an independent
activation context and a signed owner-decision artifact. The artifact parser is
closed, duplicate-key rejecting, bounded to 64 KiB UTF-8 and depth 32, and
canonicalizes one declared key order. Its Ed25519 message is domain-separated
and binds key ID, authorization digest, owner reference, nonce, decision time,
expiry, exact candidate/config/selected-candidate digests, stage, environment,
cohort, and exposure. The registry and verifier are explicit injected inputs;
there is no environment or private-key read.

Artifact JSON and direct artifact, authorization, context, and registry objects
use the same bounded descriptor snapshots and small per-field/container limits
before any date, base64, PEM, or signature operation. The opaque authenticated
result proves the historical decision and bindings but does not itself authorize
new consumption.

After signature verification, PostgreSQL rechecks authorization validity using
its own clock while holding the run row/activation CAS. Unique authorization
ID, nonce, decision reference, and artifact digest constraints make activation
one-time. An exact authenticated existing-run retry returns the same read-only
run even after expiry; expiry is applied by the database clock only when a run
would be inserted. Divergent replay conflicts. Raw
authorization JSON, signature bytes, and capability material are never stored
in evidence, logs, or error values.

## Durable state and transactions

Migration 0043 adds six normalized service-only relations: run/activation,
session lease, terminal receipt, stop-incomplete incident, cohort stop event,
and termination acknowledgement. They use explicit foreign keys, unique keys,
closed checks, row-level security, and only the minimum `service_role` grants.
No security-definer function or client policy is added.

Every state transition locks the run row, revalidates database-clock expiry,
checks the caller's expected revision, derives relational totals from persisted
children, applies one transition, and validates the next totals before commit.
Revisions are contiguous. Integer nano-USD values use PostgreSQL `bigint` and
safe JavaScript integers; aggregate evidence is bounded by the accepted
6,250,000,000,000 nano-USD sanity ceiling, not by the lower allocation caps.
New lease allocation also re-reads database time after its writes and before
completion; crossing authorization or lease expiry rolls the entire allocation
back instead of returning executable material.

## Pre-room allocation and retry

Allocation is a durable transaction that must complete before
`LiveKitInterviewProvider.startInterviewRoom`. It counts reconciled spend,
open 1,000,000,000 nano-USD reservations, and stop-incomplete excess against
the 10b hard-stop and 25b overall caps. It emits the exact SAV-479 closed lease
for one sanitized session-binding digest. Stable caller-supplied idempotency and
channel capabilities let an ambiguous commit be retried after a process restart
without minting a second lease. Only an open, DB-current, non-revoked replay
returns executable lease material. Other exact replays return a typed closed
state without a lease. Run-control hard stops atomically revoke every still-open
lease while retaining its reservation and ability to reconcile receipt/incident
evidence; automatic max/cap closure preserves the final admitted lease. This
slice exposes no app/runtime consumer for that seam.

## Evidence authentication and recovery

One lease has distinct random 32-byte worker-evidence and termination-
acknowledgement capabilities; one run has a distinct control capability. The
three capability channels are pairwise distinct within the run, including
across allocated leases, while their persisted hashes remain domain-separated.
PostgreSQL stores only domain-separated SHA-256 hashes. The server compares
fixed-length hashes timing-safely before a database mutation. Capabilities
authenticate the channel but never appear in durable evidence.

Terminal receipts release the lease reservation and reconcile observed spend.
A stop-incomplete incident keeps the full reservation, records only excess
above it, stops the run, and requires termination acknowledgement. A valid
termination acknowledgement atomically removes the retained reservation and
incident excess and replaces them with final reconciled spend at least as high
as the incident evidence. It is one-to-one, exact-replay idempotent, and cannot
reopen allocation. Stop events are one per closed reason and require the
run-control capability.

## Dependency direction

The app and voice runtime do not import the new modules. The server workflow
depends on the public SAV-479 authorization/lease contracts, security verifier,
and database store. The database store never imports the SAV-479 reference
model. Tests may deep-import that model as an oracle only.
