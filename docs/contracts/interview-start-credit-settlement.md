# Interview Start And Credit Settlement Contract

## Stable Start Identity

Every version-1 interview start requires a client-generated UUID. The UUID is
retained in session storage across transport loss, retryable server responses,
reloads, and response loss. It is cleared only after a valid successful response
or a definitive pre-mutation/terminal client error.

The UUID is also the interview session ID. It derives:

- room: `interview-<attemptId>`;
- reservation: `interview-start:<userId>:<attemptId>`;
- one canonical request fingerprint over normalized launch intent.

The owning user, session, selected question, and reservation are created or
validated in one user-serialized transaction. Equivalent replays return the
stored question/config/session. A changed request or cross-user collision fails
closed without revealing another user's session.

## Provider Provisioning

Provisioning uses a fenced, recoverable lease. The LiveKit adapter creates the
deterministic room and its one named `RoomAgentDispatch` in the same provider
request; it never creates a plain room and adds a dispatch afterward. The
adapter then validates the exact room metadata and re-lists dispatches before
acknowledging readiness. Zero, multiple, blank-name, mismatched-name, empty-ID,
or wrong-room dispatches fail closed. A ready replay performs no provider or
deadline creation and mints only a fresh participant token after a new durable
authorization. Provisioning lease and hard-deadline predicates use
PostgreSQL's `clock_timestamp()` when the locked write is evaluated, so waiting
for another transaction cannot preserve a transaction-start timestamp past a
lease or deadline. A transient authorization read failure withholds the token
and remains retryable; it is not durable evidence that a healthy ready room
should be deleted or its credit settled.

Every demo and interview worker requires its explicit dispatch-name environment
variable in local and hosted modes. A worker never registers unnamed, because
LiveKit assigns unnamed workers to every newly created room through automatic
dispatch. Expired leases are never taken over for new provider work because
LiveKit does not expose a caller-supplied dispatch idempotency key. A five-minute
recovery scan fences stale pending/provisioning/failed starts, commits a
provider-failure terminal outcome, converges the active reservation to release,
and leaves room cleanup as durable retryable intent. This also repairs terminal
version-1 rows
whose ledger settlement was interrupted.

The room metadata includes the authenticated candidate identity. The Python
runtime waits for that participant before greeting while the hard deadline
continues to run.

## Deployment Capability Gate

Generic Vercel PR Preview is web-only. The shared LiveKit capability boundary
returns HTTP `503` with `error=voice_unavailable_in_preview` and
`retryable=false` before authentication, request parsing, credit reads or
reservation, session/room mutation, LiveKit configuration, or provider I/O.
The launcher disables its start action and explains that staging is the voice
rehearsal lane. Trusted staging and Production retain the complete provisioning
and credit contract above.

## Usable Evidence

The start transaction reserves one credit but never consumes it. A version-1
interview becomes usable only after both are durable:

1. canonical LiveKit candidate-and-agent activation; and
2. a non-blank version-2 interviewer turn with `delivery_state = 'delivered'`.

Activation, transcript creation/replay, and terminalization invoke one
convergence workflow. It locks `app_user`, then session, reservation, and grants.
When evidence qualifies, the immutable usable marker and consume transaction
commit together. When a terminal session has no qualifying evidence, release
commits instead. Consume and release cannot both win.

Version-0 rows stay readable and are never given fabricated attempt or usable
evidence. Relaunch preflight requires zero active legacy reservations,
nonterminal legacy sessions, malformed version-1 correlations, duplicate
rooms/questions/reservations, non-ready or stale active starts, terminal active
reservations, and unsettled usable evidence. Launch automation must use
`MEELNI_LAUNCH_STRICT=1` so nonzero readiness counts exit unsuccessfully.

## Rollout

The migration is additive and old writers remain version 0. The relaunch flag
stays default-off and the authenticated start API enforces the same server-side
gate before any mutation. Provider-backed rehearsal belongs only to trusted
staging; ordinary PR Preview cannot create version-1 voice sessions.
