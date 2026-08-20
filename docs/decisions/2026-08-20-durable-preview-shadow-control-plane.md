# Make Preview-Shadow Authority Durable Before Any Room Construction

Date: 2026-08-20
Status: accepted implementation boundary
Issue: SAV-480
Parent: SAV-476 remains open

## Context

SAV-479 deliberately shipped only closed authorization/configuration contracts,
local lease-bounded accounting, and a pure reference model. Separate workers or
rolling instances could each accept the same authorization and could not
enforce global session/spend caps. Current full-interview startup creates the
LiveKit room and named dispatch inside `LiveKitInterviewProvider.startInterviewRoom`,
after the durable interview provisioning claim. Any Preview-shadow lease must
therefore be admitted before that provider call.

## Decision

Add one server-owned PostgreSQL control plane with these boundaries:

1. Verify a separate Preview-shadow owner-decision artifact with Ed25519. Use a
   new domain, closed canonical bytes, an explicit injected versioned public-key
   registry, and exact authorization/context bindings. Store only its digest,
   key ID, and bounded content-free decision evidence.
2. Consume authorization ID, nonce, decision reference, and artifact digest in
   one durable activation CAS. Database time is final at the CAS; exact
   ambiguous-commit retry converges, including exact read-only replay after
   authorization expiry, while absent-run expiry and divergent replay fail.
3. Lock the run row for every transition. Allocate the exact SAV-479 session
   lease before any room/dispatch/token/worker/provider construction and count
   all open reservations plus conservative spend against both caps.
4. Authenticate worker receipt/incident evidence, run stop events, and process
   termination acknowledgement with separate 32-byte random capabilities.
   Persist only domain-separated hashes and compare them timing-safely.
5. Keep stop-incomplete reservation and excess until an authenticated
   termination acknowledgement atomically replaces them with final spend.
   Recovery converges durable accounting but never reopens a stopped run.
6. Return executable allocation replay material only for an open, DB-current,
   non-revoked lease. A run-control hard stop atomically revokes open leases but
   preserves their conservative reservations and evidence reconciliation. A
   final lease admitted at a max/cap boundary remains executable.
7. Keep this slice server-only and unwired. SAV-479 remains a test oracle, not a
   runtime dependency or public authority.

## Consequences

- Cross-process replay and cohort caps become database authority rather than
  in-memory claims.
- Retried operations can distinguish exact committed work from divergence after
  an acknowledgement loss or server restart.
- The repository still cannot execute Preview shadow: no app/runtime consumer,
  executable owner artifact, credential path, provider call, deployment, room,
  or flag mutation is added.
- A later separately reviewed integration must insert lease allocation into the
  session-start path before `startInterviewRoom` and must receive a fresh exact-
  merged-SHA owner authorization.

## Rejected alternatives

- Use the SAV-479 reference model or a worker-local store: neither provides a
  global CAS or rolling-deployment cap authority.
- Treat self-digests as signatures: they provide integrity/idempotency only.
- Persist raw bearer capabilities or signatures: they expand breach impact and
  are unnecessary for audit evidence.
- Release budget on cleanup ambiguity: provider work may have occurred.
- Reopen a run after termination acknowledgement: the incomplete stop is a
  fixed hard-stop signal, not a transient allocation pause.
