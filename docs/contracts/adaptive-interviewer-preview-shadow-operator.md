# Adaptive Interviewer Preview-Shadow Operator Contract

## Commands

The provider-free owner tool exposes `prepare`, `sign`, and `verify`. The
provider-backed operator exposes `activate`, `start-cell`, and `stop`; the
dedicated internal worker endpoint performs admission and reconciliation.
Every command takes explicit absolute external file paths. No command
searches the repository, home directory, environment, or provider for missing
authority or credentials.

`prepare` requires a clean exact candidate and creates two owner-only files:
the closed SAV-479 authorization and the unsigned owner-decision payload.
`sign` creates the closed Ed25519 artifact without overwriting an existing
file. `verify` performs no database, LiveKit, OpenAI, Statsig, or Vercel call.

## Execution

`activate` requires explicit database configuration, signed artifact,
authorization, key registry, and run-control capability. The durable CAS is
the only consumer of the one-use authority. Activation validates only the
canonical staging database/environment identity; it neither requires nor
reads a LiveKit URL, worker name, API key or API secret. Preview and
Production-project room commands retain their separate complete LiveKit
identity checks. Durable stop uses the same staging-only environment boundary
and therefore cannot be blocked on an unrelated LiveKit credential.

`start-cell` requires one closed round/voice-condition pair from the fixed
4x7 matrix, exact run revision, session binding, lease expiry, worker and
termination capabilities, and explicit Preview LiveKit credentials. Durable
allocation MUST commit before room or dispatch construction. A closed replay,
expiry, denial, conflict, or invariant failure makes zero provider calls.

The internal worker endpoint is available only in the exact staging Preview
environment with its explicit rehearsal-server guard. It is not a customer or
ordinary session-start route and exposes only admission and terminal evidence
reconciliation.

The operator returns only contract versions, exact source/config digests,
matrix coordinates, run/lease revisions, sanitized result codes, timestamps,
and integer spend/reservation totals. It never returns or logs credentials,
capabilities, tokens, provider payloads/IDs, room names, identities, transcript
or prompt text, model output, or raw errors.

## Worker

Only the isolated Preview interview deployment may consume the SAV-481 job
metadata envelope. It does so before `ctx.connect()`, with exact run/candidate/
session binding, current time, durable lease admission, kill switch, and
OpenAI transport explicitly supplied by the Preview bootstrap. Invalid or
missing input is unavailable with no provider construction.

The worker is Shadow-only and silent. Ordinary interview metadata cannot enter
this branch. Production behavior and all customer-visible output are unchanged.

## Authority exclusions

The packet never authorizes Preview influence, Production, default-on, launch
GO, customer data, or reuse. The rehearsal runner must reject every such field
unless it is exactly false.
