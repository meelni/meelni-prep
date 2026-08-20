# Adaptive Interviewer Preview-Shadow Durable Control Plane

Current state: repository implementation only; live use prohibited

## Prohibited actions

Do not read environment or credential files, pull Preview configuration, load a
private owner key, connect to a shared database, call OpenAI or LiveKit, create
or dispatch a room, spend, deploy, mutate flags, influence speech, enter
Production/default-on, or infer GO/NO-GO. The checked repository contains no
executable owner-decision artifact.

## Provider-free local verification

Use exact Node 22.22.0. Unit tests inject ephemeral Ed25519 keys, deterministic
clocks, random capabilities, and fake database boundaries. Database tests use
only the guarded loopback migration harness:

```bash
MIGRATION_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/meelni_test npm run test:database-migrations
```

The harness refuses non-loopback hosts and database names without `_test`, then
creates and drops disposable databases. Do not substitute a Preview or
Production URL.

## Future activation sequence

This sequence remains blocked until SAV-480 is merged, independently reviewed,
and a new exact-merged-SHA owner artifact is issued outside the repository:

1. Load the reviewed merged candidate and independently compute the exact
   candidate SHA, Preview config digest, selected-candidate digest, target, and
   current time.
2. Parse the SAV-479 authorization and the signed owner-decision artifact with
   the explicit reviewed public-key registry. Keep raw inputs outside evidence.
3. Submit the authenticated values and stable run-control capability to the durable
   activation transaction. Retry only the exact request after ambiguity.
4. Before each `LiveKitInterviewProvider.startInterviewRoom` call, submit the
   sanitized session binding, revision, TTL, and stable per-lease worker and
   termination capabilities. Proceed only when the result is `allocated` or
   `replayed` and contains the committed admitted lease. `replayed_closed` is
   read-only evidence and must never construct a room, worker, or adapter.
5. Deliver the lease and worker capability only to the isolated shadow runtime;
   keep the termination capability on the trusted process-supervisor channel.
6. Reconcile a terminal receipt or stop-incomplete incident outside the speech
   path. Use the run-control channel for hard-stop events. Never log a raw
   capability, signature, authorization, provider payload, or customer value.

No part of that live sequence is wired by SAV-480.

## Stop and recovery

Record the hard-stop event before admitting another lease. The same transaction
revokes every still-open lease for execution while retaining its reservation;
those sessions may only submit authenticated conservative receipt or incident
evidence after the run is stopped. A terminal
receipt closes one lease. A stop-incomplete incident leaves its full reservation
open and requires process termination.

After the trusted supervisor confirms the exact process/worker is terminated,
submit one capability-authenticated termination acknowledgement. It atomically
replaces the retained reservation and existing incident excess with final
reconciled spend. Exact retry is safe; divergence is a conflict. The run remains
stopped, so recovery cannot resume allocation or authorize a later rollout
stage.

## Evidence and incident handling

Operational output is limited to content-free result codes such as `activated`,
`replayed`, `replayed_closed`, `conflict`, `denied`, `unavailable`, `recorded`,
and `stopped`, plus
approved digests/revisions/counts/amounts. Do not include raw exception text.
If a capability or signature could have reached logs, stop, rotate the affected
channel/key outside this repository, and retain only a sanitized incident
reference.

## Rollback

Application rollback leaves the additive service-only tables in place. There is
no application/runtime wiring to remove in this slice. Do not delete or rewrite
activation, spend, incident, or acknowledgement truth. A forward migration may
retire the authority only after all open leases are terminally accounted and the
run remains stopped.
