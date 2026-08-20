# Adaptive Interviewer Preview-Shadow Rehearsal Wiring Contract

## Authority order

The dedicated rehearsal workflow MUST complete durable session-lease allocation
before calling any LiveKit room or dispatch API. Only an `allocated` or
executable `replayed` result may proceed. `replayed_closed`, stale, expired,
denied, conflict, invariant, or unavailable outcomes MUST NOT construct a room.

This workflow is distinct from the ordinary interview-start workflow. It is not
called by an application route and does not change Production interview
behavior.

## LiveKit job metadata

The job metadata contract is
`adaptive-interviewer-preview-shadow-job-metadata.v1`. It is a closed JSON
object containing:

- the exact SAV-480 `adaptive-interviewer-preview-shadow-session-lease.v1`
  object;
- the 32-byte raw worker-evidence capability encoded as the existing canonical
  token;
- the run revision returned by allocation for the initial reconciliation
  attempt.

The envelope MUST be bounded, duplicate-key rejecting, descriptor-safe on
direct-object paths, and byte-identical across TypeScript and Python fixtures.
It MUST NOT contain the termination capability, run-control capability,
credentials, transcript, prompt, model output, customer identity, room token,
or provider key.

The envelope is LiveKit agent-job metadata only. It MUST NOT be copied to room
metadata, participant metadata, durable evidence, application logs, traces, or
customer output.

## LiveKit reconciliation

When job metadata is present, the LiveKit integration MUST create the atomic
named dispatch with that exact metadata and verify that the sole matching
dispatch has the same bytes. An existing dispatch with absent or different
metadata is a terminal conflict. Existing callers that omit job metadata keep
their current behavior and verify an absent/empty metadata projection.

## Python construction

The Python bootstrap MUST accept job metadata plus explicitly injected:

- a durable lease-admission verifier;
- an OpenAI Responses transport factory;
- exact run, candidate, and session-binding expectations;
- current time and kill-switch state.

There is no ambient environment, credential, provider, verifier, or transport
fallback. Missing, malformed, closed, expired, mismatched, or unadmitted input
returns a typed disabled/unavailable result with no provider construction.

The resulting runtime remains read-only shadow. It has no speech,
`AgentSession`, controller, transcript-write, feedback, or customer-output
surface.

## Terminal evidence

Exactly one terminal session receipt or stop-incomplete incident may be
projected for reconciliation. The server reconciliation facade requires the
raw worker-evidence capability and the caller's current expected run revision,
then delegates to the SAV-480 store unchanged. It returns only content-free
typed outcomes and MUST NOT log or persist the raw capability.

## Non-authority

Repository merge does not authorize provider credentials, spend, deployment,
live rooms, Preview influence, Production, default-on, or launch GO. Those
remain separate human-owned gates.
