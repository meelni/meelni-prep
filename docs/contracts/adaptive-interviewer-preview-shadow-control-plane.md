# Adaptive Interviewer Preview-Shadow Durable Control Plane

Status: design-frozen server contract; implementation remains unwired

## Domains

- Owner decision artifact/key registry:
  `meelni.adaptive-interviewer-preview-shadow-owner-decision.v2` /
  `meelni.adaptive-interviewer-preview-shadow-owner-key-registry.v1`.
- Durable control plane: `adaptive-interviewer-preview-shadow-durable-control-plane.v1`.
- Capability hash domains: run control, worker evidence, and termination
  acknowledgement each use distinct v1 domains.
- Activation, lease, receipt, stop-incomplete, and stop-event wire versions stay
  the exact accepted SAV-479 versions.
- Termination acknowledgement:
  `adaptive-interviewer-preview-shadow-termination-acknowledgement.v1` and its
  distinct digest domain.

## Owner-decision verification

One signed artifact contains exactly `contract`, `payload`, and `signature`.
The payload is a closed canonical projection binding:

- owner ID/role, `APPROVE_BOUNDED_PREVIEW_SHADOW`, key ID, authorization ID,
  nonce, owner direction/decision references, decision time, and expiry;
- exact candidate Git SHA, Preview configuration digest, selected-candidate
  digest, the domain-separated SHA-256 of the exact 32-byte run-control
  capability, `preview_shadow`, `preview_staging`, `shadow`, and `none`; and
- fixed false Production, default-on, influence, later-stage, and GO/NO-GO
  authorities.

The authenticator accepts an explicit registry and trusted current time. JSON
and direct-object artifact, authorization, context, and registry paths converge
on bounded descriptor snapshots before date, base64, or cryptographic work. It
rejects duplicate JSON keys, inputs above 64 KiB UTF-8, nesting over 32,
container-count or per-field bounds, unexpected keys/descriptors/prototypes,
invalid base64/signature/key-at-decision windows, future decisions, or any
independent binding mismatch. All five later-authority fields must be the
literal `false` before canonical serialization, including through the exported
signing-message helper; caller objects, cycles, or `toJSON` hooks cannot enter
the signed bytes. Signature verification covers the ASCII
artifact contract, one NUL byte, then canonical payload JSON. No private key,
authorization file, registry file, environment value, or credential is read by
the authenticator. Its module-branded result proves authenticity and bindings;
it is not consume authority and may represent an expired historical decision.
The authenticator accepts the raw run-control capability only to recompute its
signed digest; v1 artifacts and payloads without that digest fail closed.

## Durable activation and run

Activation requires the parsed SAV-479 authorization, signed v2 decision artifact,
independent context, expected database-clock window, and the exact caller-stable
random run-control capability bound by that signature. The transaction
recomputes the same domain-separated digest before CAS and verifies one unique authorization ID,
authorization nonce, owner decision reference, and signed-artifact digest and
creates exactly one run. It stores no raw authorization or signature. An exact
authenticated replay of an existing run remains readable after authorization
expiry and returns no capability material; an absent run is never created after
expiry, and any changed artifact/binding/run capability conflicts.

The run owns fixed caps: 25 sessions, 25,000,000,000 nano-USD overall,
10,000,000,000 nano-USD cumulative stop, 1,000,000,000 nano-USD per open lease,
250,000,000,000 nano-USD per-session observed sanity, and
6,250,000,000,000 nano-USD aggregate observed sanity. The last value is an
evidence ceiling only and never expands allocation authority.

Every transition holds a `FOR UPDATE` lock on the run row, uses the database
clock for expiry, validates expected revision and persisted relational totals,
and commits one contiguous revision. Automatic stop recording may commit the
allocation revision followed by one stop-event revision in the same transaction.
New allocation re-reads the database clock after those writes; if its
authorization or lease expired during the transaction, every allocation write
rolls back and no executable lease is returned.

## Allocation

The caller supplies one 64-hex sanitized session-binding digest, expiry/TTL,
expected revision, and stable random worker-evidence and termination-ack
capabilities. Run-control, worker-evidence, and termination capabilities must be
pairwise distinct for the run, including across already allocated leases. The
transaction denies stopped/expired/stale/wrong-target/cap-
exceeding state and otherwise emits the exact SAV-479 lease. Run/session ordinal,
session binding, allocation revision, and lease ID are unique. Exact same-input
retry returns executable lease material only while that durable lease is still
open, DB-current, and not revoked. Expired, revoked, terminal, stop-incomplete,
or termination-acknowledged replay returns `replayed_closed` plus a closed state
and lease ID, with no executable lease. Changed capability, time, or binding
state is a content-free conflict. A cap-reaching final allocation remains open;
the automatic cap event stops new allocation but does not revoke that admitted
lease.

Allocation MUST complete before a LiveKit room, dispatch, participant token,
worker, or provider adapter is constructed. This slice provides no consumer.

## Reconciliation

- A terminal receipt requires the exact lease worker capability, one open or
  run-control-revoked lease,
  exact self-digest, at least `attempt_count * 100,000,000` nano-USD, zero local
  outstanding attempt reservations, and no prior incident. It releases the 1b
  reservation and records un-clipped observed spend up to 250b.
- A stop-incomplete incident requires the same worker capability, retains the
  entire 1b reservation, records `max(0, observed - 1b)` as excess, and stops
  the run. There is exactly one incident per lease.
- A cohort stop event requires the run-control capability and exactly one closed
  reason/evidence pair per reason. It atomically stops allocation and marks all
  still-open leases revoked without releasing their reservations. Revoked leases
  remain evidence-reconcilable but cannot be re-emitted for execution.
- A termination acknowledgement requires the lease's distinct termination
  capability, the existing incident, content-free termination disposition and
  evidence digest, and final spend at least equal to incident spend. It releases
  the retained 1b and removes prior incident excess while adding final spend to
  reconciled total in the same transaction. It never reopens the run.

All exact replays are idempotent. Divergent payload, ID, capability, lease/run,
or revision replay conflicts. Already-open sessions may reconcile upward after
the run stops. No transition rejects trustworthy spend merely because it exceeds
an execution cap; it records within the aggregate sanity ceiling and preserves
the stop.

## Privacy and dependency boundary

Persisted rows may contain only version/digest fields, closed target/reason/
outcome codes, ordinals/revisions, whole-second timestamps, integer amounts,
and domain-separated capability hashes. They contain no customer/user/room/
participant/writer/provider identifiers, prompt/transcript/feedback content,
raw response/error, signature bytes, authorization JSON, or raw capability.

Tables are RLS-enabled, deny `PUBLIC`, `anon`, and `authenticated`, and grant
only required operations to `service_role`. No security-definer bypass exists.
Composite foreign keys bind each receipt/incident to its exact run, lease,
ordinal, allocation revision, and configuration digest, and bind each
termination acknowledgement to its exact run/lease/incident tuple.
The app, agent package public entrypoint, and Python runtime do not import the
durable module. SAV-479 reference transitions are tests only.
