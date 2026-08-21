# Design

The authenticated interview-start workflow is already durable and completes
credit reservation before room creation. It will derive a closed admission from
that committed start and HMAC-sign it with the LiveKit shared secret. The nested
room-metadata contract carries no credential and is deterministic on retry.

The Python room parser preserves the admission only after strict structural
validation. A Production runtime factory verifies its signature and exact
session/room/deadline/config bindings before reading `OPENAI_API_KEY` or creating
the official retry-free client. It wraps the reviewed adapter in a local
reserve-before-I/O ledger and passes it to the existing Director shadow session.

The existing Director influence gate, assessor, controller reducer, lifecycle
store and delivery ledger remain the only path to a spoken move. Missing or
invalid admission keeps `adapter=None`.
