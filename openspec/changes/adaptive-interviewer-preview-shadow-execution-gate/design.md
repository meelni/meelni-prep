# Design

## Authorization and configuration

`@meelni/agent` owns strict JSON parsing, exact object schemas, canonical
configuration and authorization digests, pending request generation, and pure
reference protocols for one durable control-plane activation plus atomic
cohort-ledger session leases. They do not provide live cross-process replay or
cap enforcement; a follow-up authenticated durable adapter must do that.
Activation requires independent exact SHA/config/selection/target/time bindings
and a fresh opaque result from an injected trusted owner-decision verifier
before CAS; it never self-binds from the submitted record. Lease, terminal-
receipt, and stop-incomplete self-digests provide integrity/idempotency, not
authenticity. The future durable adapter must authenticate worker provenance
and the reconciliation channel. Preview authorization is domain-separated from
preparation and Production actions and cannot authorize influence or a later
stage. Workers do not consume stage authorization.

## Runtime seam

Python owns a provider-neutral construction seam. It receives only an exact
config binding, a valid unexpired session lease, an injected trusted durable
admission verifier, and an injected transport factory. Default-off and missing
durable admission return typed `disabled|unavailable` results with no adapter.
It never reads credentials or environment state. The app remains unwired with
literal `adapter=None`; provider-specific behavior stays behind the existing
Director adapter seam.

## Spend and evidence

The control plane allocates a derived 1,000,000,000 nano-USD session lease.
Within it, at most ten attempts each reserve 100,000,000 nano-USD before I/O.
Normalized successful usage retains the conservative attempt reservation;
failure/timeout/cancel/ambiguity also retains it; larger observed billing
reconciles upward and stops. Global overall/stop caps include outstanding
session leases only in the future durable cohort ledger. The reference model
also records stop-incomplete spend above the retained lease as exact excess
without double counting. Sanitized receipts reconcile centrally outside
speech. This slice defines pure protocols but no live durable adapter.

## Lifecycle

Provider-free rehearsal drives the actual Director shadow boundary with fake
transports. One memoized settlement operation fences admission, reserves
shutdown time, awaits cancellation, and attempts adapter close in a finally
path within one absolute 250 ms deadline. Confirmed cleanup creates one terminal
session receipt. Unconfirmed cleanup creates one separate content-free
stop-incomplete incident, retains the full central session reservation, and
requires the durable control plane to stop allocation until authenticated
worker/process termination acknowledgement. No acknowledgement transition or
durable adapter ships in this slice. It never calls speech, `AgentSession`,
transcript, feedback, room, or customer-output APIs. The fixed 28-cell live
matrix remains `unperformed`.
