# Adaptive Interviewer Preview-Shadow Rehearsal Wiring Runbook

This runbook describes the repository seam only. Do not deploy or run it from
this document.

## Provider-free verification

1. Confirm the branch is based on the expected `origin/main` SHA.
2. Run the focused server-workflow and LiveKit integration tests.
3. Run the pinned Python job-metadata/bootstrap/runtime tests.
4. Verify allocation completes before the first room-provider call.
5. Verify a closed/revoked/expired lease produces no room call.
6. Verify job metadata is absent from room and participant metadata.
7. Verify the ordinary app route, start-session workflow, and interview agent
   still have no Preview-shadow bootstrap consumer and retain `adapter=None`.
8. Run the broad Node 22, pinned Python, calibration, build, public-build, and
   exact-range security gates.

## Later execution prerequisites

A live rehearsal requires a new owner action bound to the exact merged SHA and
configuration. That action must separately authorize:

- the trusted Preview environment and named agent deployment;
- provider credential use and spend;
- the exact durable run, current revision, stable channel capabilities, and
  session-binding inputs;
- the session cap, stop thresholds, privacy/retention terms, and lifecycle
  response;
- the one execution window and post-run evidence review.

Until then, do not create a LiveKit room, deploy an agent, inject a provider
transport, open a flag, or treat the 28-cell matrix as performed.

## Failure handling

- Allocation failure or closed replay: stop before room construction.
- Room/dispatch ambiguity: preserve the durable lease and investigate; do not
  mint a second binding or fabricate terminal evidence.
- Runtime admission failure: do not construct the provider transport.
- Terminal receipt/incident revision conflict: read the current durable run in
  the future trusted reconciler and retry the exact evidence; do not mutate it.
- Cleanup-unconfirmed: submit only the stop-incomplete incident and retain the
  reservation until authenticated termination acknowledgement.
