# Design

## Atomic command

The owner-scoped End transaction locks the session, writes `ending_at` and the
next lifecycle version, selects the current registered writer while that lock
fences new registration, and inserts one command keyed by session and accepted
lifecycle version. The command copies the immutable cutoff, room, writer ID,
and generation and has a deterministic command identity plus a 20-second
expiry. A session without a registered writer accepts End without inventing a
runtime target; frozen evidence later classifies that case as missing.

## Pull and acknowledgement

The existing timestamped HMAC transcript endpoint carries two new strict
metadata-only messages. Pull returns only the latest command matching the exact
session, room, writer ID, and generation. Ack locks that command and requires a
matching durable `runtime_settlement` row and outcome. Replays return the
existing acknowledgement; stale, expired, conflicting, unknown-version, or
wrong-generation messages fail closed.

An existing runtime that knows only the packet contract remains compatible:
persisting its exact writer settlement atomically acknowledges a pending
command. New runtimes send the explicit ack after settlement persistence, which
converges to the same existing state.

## Runtime and finalizer

The server derives the legacy packet payload from the command and treats
provider targeting or delivery failure as hint loss, not command loss. The
runtime pulls after a valid packet, exact candidate disconnect, and shutdown,
installs the immutable local cutoff fence, drains, persists settlement, and
acks. The finalizer polls only within its existing 20-second stage and then
marks any still-pending command expired; terminalization continues from typed
database evidence without upgrading missing or degraded proof.
