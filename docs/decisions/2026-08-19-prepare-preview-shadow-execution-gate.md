# Prepare A Fail-Closed Preview-Shadow Execution Gate

Date: 2026-08-19
Status: accepted repository boundary
Parent issue: SAV-476 remains open
Decision owner: the human owner authorizes live stages; this record implements
only the repository boundary needed to request and consume that authorization.

## Context

The selected OpenAI Responses Director adapter is merged at
`a618adab77441f378e9cd0775c93e7c9ce38b7fb`, reviewed tree
`0de7929d6b8c1944a6d4d4128c98a751a82f0d4b`. Its preparation authorization
cannot authorize provider execution. The owner later said “I approve all
gates” at
`linear:SAV-476:comment:fe76af4b-9a83-4899-b38e-db985e1f3c84`.
That direction permits the workstream to progress, but the existing rollout
contract requires every live step to be bound to the exact merged SHA and
configuration. A broad sentence cannot supply a future SHA, one-time nonce, or
bounded execution expiry and therefore is not reusable live authority.

## Decision

Create a domain-separated `preview_shadow` boundary with four deep modules:

1. `@meelni/agent` owns a closed authorization and pending-request generator.
   The executable record binds the exact merged candidate SHA, the full
   Preview-stage configuration digest, selected candidate digest, environment,
   stage, cohort, caps, privacy, thresholds, hard stops, rehearsal matrix,
   external reference, whole-second decision/expiry, and a one-time nonce.
   Its JSON reader rejects more than 64 KiB UTF-8 or nesting deeper than 32
   before unbounded traversal.
2. A deterministic runtime configuration pins the selected adapter/provider/
   model and the complete owner envelope. Its digest uses the contract version,
   one NUL byte, and canonical JSON. No environment value participates.
3. A future durable control-plane activation consumes stage authorization
   exactly once and creates one authoritative cohort ledger. Activation must
   independently bind the deployed/reviewed SHA, config/selection digests,
   target, and trusted time, then require a fresh opaque result from an
   authenticated owner-decision verifier before CAS. This slice specifies a
   pure reference model only; separate in-memory instances do not provide replay
   protection or authority. Live execution remains blocked until a durable
   authenticated adapter implements it. Lease, terminal-receipt, and
   stop-incomplete IDs are unkeyed self-digests: integrity/idempotency only, not
   authenticity. The future adapter must authenticate worker provenance and the
   reconciliation channel.
4. The Python runtime construction seam accepts only an explicitly injected
   admitted unexpired session lease, trusted durable-admission verifier, and
   transport factory. Default-off is typed `disabled`; missing durable
   admission is typed `unavailable` with no adapter. The application continues
   to pass literal `adapter=None`. The seam has no credential, environment,
   room, speech, transcript, feedback, or flag mutation capability.
5. Each provider attempt reserves a conservative integer nano-USD amount before
   transport admission. Normalized successful usage is evidence rather than
   billing truth, so every outcome retains at least the full reservation;
   failures, timeouts, cancellations, invalid responses, and ambiguity also
   retain it. Both the overall and hard-stop caps include open
   reservations. Evidence contains only versioned state, ordinal attribution,
   integer amounts, and closed outcome codes.

The per-session lease is derived as
`ceil(maximum_spend_nano_usd / maximum_sessions) = 1_000_000_000` nano-USD.
Each session allows at most ten attempts, so the local per-attempt reservation
is 100,000,000 nano-USD. It is deliberately much larger than the selected
bounded request’s normalized estimate. If trustworthy provider billing exceeds
it, reconciliation records the larger amount; local/session and central/run
admission stop as applicable, and observed spend is never clipped.
The per-session observed-spend sanity ceiling is 250,000,000,000 nano-USD;
the distinct safe ledger aggregate is exactly 25 times that value. The latter
does not expand either execution cap. It lets every already-admitted session
record upward evidence even after allocation has stopped.

LiveKit Agents 1.6.5 documents `AgentSession.shutdown(drain=True)` as
non-blocking and `AgentSession.aclose()` as awaitable. Current LiveKit Cloud
[rolling deployment](https://docs.livekit.io/deploy/agents/managing-deployments/)
routes new sessions to new instances while old instances may remain for up to
one hour to finish; production server mode also supports
[graceful drain](https://docs.livekit.io/agents/server/lifecycle/). Deployment
rollback is therefore not a precise per-session shadow stop. Preview shadow
never controls voice-session shutdown or drains speech. Its own settle path
fences new work, cancels in-flight Director tasks, and closes the adapter under
one coalesced absolute 250 ms deadline; the canonical runtime independently
owns any awaited `AgentSession.aclose()` and transcript settlement.

Cleanup confirmation is a budget-release boundary. A successful terminal
session receipt is forbidden unless shutdown and adapter close completed.
Bounded cleanup ambiguity instead creates one domain-separated,
content-free stop-incomplete incident; the authoritative ledger must retain the
full session lease and stop new allocations until authenticated worker/process
termination acknowledgement. This slice intentionally defines no
acknowledgement transition, so the reference model cannot reopen itself. Spend
observed above the retained lease is recorded immediately as incident excess;
a future acknowledgement must reconcile it without double counting.

## Consequences

- The repository can generate an exact pending owner request after merge and
  can fail closed on malformed, expired, drifted, replayed, or cross-domain
  authorization.
- There is still no provider execution path in the application. Live execution
  requires a durable atomic activation/session-ledger adapter and a new exact
  authorization.
- Ambiguous provider attempts consume conservative budget. This favors safety
  over rehearsal capacity and prevents successful-response estimates from
  masquerading as provider billing truth.
- Preview shadow has no path to block speech or affect controller, transcript,
  feedback, settlement, or customer output.

## Rejected alternatives

- Reuse the preparation authorization or the broad owner sentence: neither is
  bound to the future merged execution candidate or one-time semantics.
- Read flags, credentials, or authorization from ambient environment inside
  the controller/Director core: this would collapse provider, rollout, and
  application authority.
- Release reservations on transport failure or cancellation: a provider may
  have accepted or billed an attempt even when Meelni lacks final usage.
- Use a LiveKit redeploy as per-session rollback: rolling deployment and drain
  lifecycles cannot precisely fence one shadow session or prove transcript/
  feedback isolation.
