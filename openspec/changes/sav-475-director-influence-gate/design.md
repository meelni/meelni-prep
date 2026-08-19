# Design

## Admission seam

`SessionScopedInterviewerTools` already serializes mutation, refreshes current
writer lifecycle, fences streams/races, and calls the controller adapter. The
new gate runs synchronously inside that lock after the original request's
identity/deadline checks and before controller mutation.

The gate reads the current server policy and peeks at the session-local store.
It has no async API and no adapter, task, network, prompt, provider, transcript,
or persistence capability. An accepted recommendation is converted into an
effective tool request with the original call identity, deadline, idempotency,
version, and expected revisions, plus a recalculated digest. Only move type,
target, and that move's closed controller-validated reason code may differ.
Commit remains non-close and graceful-close remains close-only. That request
must pass the existing assessor and controller reducer. The controller remains
the sole admission authority.

## Fail-safe fallback

Disabled, unavailable, missing, late, stale, malformed, mismatched, repeated,
ineligible, already-delivered, tool-incompatible, or controller-denied advice
does not fail the tool call. The original request follows its existing path.
Director failures never request model fallback and never create speech.

## Revocation and replay

The exact enablement/config generation is read for every admission, not cached
at session construction. A recommendation ready before revocation cannot
influence an admission after revocation.

Consumed recommendation IDs are retained only for the current finalized source
turn and transcript revision, under a fixed capacity, and cleared on authority
advance or settlement. After canonical delivery, the controller's bounded
delivered-probe ledger is authoritative; the local set is only a pre-delivery
duplicate fence.

## Observability

Content-free events carry exact influence contract/policy/config versions,
rollout cohort, Director recommendation contract/policy/adapter versions, a
closed decision reason, and planned/admitted/canonically-delivered move types.
They contain no session/turn/question identifiers, transcript or prompt text,
candidate evidence, recommendation prose, provider payload, or reasoning.

## Application boundary

The full-interview entrypoint may construct the gate, but SAV-474 still injects
`adapter=None`. The flag defaults off. Tests alone use the deterministic fake.
