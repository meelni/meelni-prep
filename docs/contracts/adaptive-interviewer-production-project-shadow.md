# Adaptive Interviewer Production-Project Shadow Contract

Status: design freeze; no live authority checked in

## Meaning

`production_project_shadow` is a transport topology, not the adaptive rollout
stage `production_shadow`. The staging database/control plane remains the
durable authority. The existing paid Production LiveKit project and interview
agent carry one explicit synthetic room. Director output remains silent,
read-only and exposure `none`.

## Independent authority

No single artifact authorizes the workflow. The logical Shadow run requires a
fresh Ed25519 Preview-shadow owner decision bound to the exact merged candidate,
runtime config, selected-candidate digest, staging environment, Shadow cohort,
exposure `none`, nonce, owner time and expiry. A worker mutation requires a
separate one-use `livekit-production-interview-deploy` action. One room and
dispatch require a third one-use `livekit-production-shadow-room` action whose
closed hashes bind:

- topology `production_project_shadow`, logical environment
  `preview_staging`, stage `preview_shadow`, cohort `shadow`, exposure `none`;
- exact run, candidate, run revision, session binding, matrix cell and expiry;
- exact LiveKit Production project host, interview agent ID and verified
  current deployment version;
- exact staging control-plane origin; and
- false influence, later-stage, default-on and launch fields.

The deploy action cannot activate a run or admit a room. The room action cannot
deploy or activate a run. The Shadow owner decision cannot deploy, change
Production secrets, or satisfy either generic Production action verifier.
Pending, Preview-project room targets, rollout-production, expired, replayed,
self-bound, malformed or cross-target records fail closed.

## Deployment

The guarded deploy snapshots one exact Production config and one owner-only
runtime file containing the ordinary Production interview variables, including
the provider key, plus the closed Shadow bootstrap variables. It consumes
Production action authority before `lk`, replaces the complete secret set,
archives the exact authorized Git commit, and records `meelni.source_sha`. It
updates only the canonical Production interview agent; the demo agent is
forbidden.

The Shadow bootstrap is run-bound and candidate-bound. Missing, killed,
expired or mismatched values leave ordinary jobs on the existing path and make
Shadow metadata unavailable before connection/provider construction. A
successful deploy is not room authority.

## Admission and execution

The operator uses the staging database and internal control-plane endpoint but
the exact Production LiveKit URL and interview agent. It accepts only a closed
synthetic room intent. The durable lease must commit before room creation and
dispatch. No generic app/session route can mint the metadata.

Immediately before room-action consumption and durable allocation, the
operator reads the current LiveKit deployment and requires the exact bound
version to be active, Available, and attributed to the exact candidate SHA.
A stale or changed deployment requires a fresh room action. LiveKit does not
offer version-selective dispatch, so any concurrent human interview-worker
deployment is forbidden for the duration of this one-cell operation.

The worker authenticates durable admission before constructing the provider
transport. It cannot speak, mutate controller authority, persist or publish a
transcript, generate feedback, or affect customer output. Ordinary interview
metadata cannot enter the Shadow branch.

## Evidence and stop

Exactly one terminal receipt or retained stop-incomplete incident exists per
admitted lease. One live cell must settle and reconcile before another cell is
eligible. Any hard stop fences allocation first. Cleanup uses the existing
bounded, coalesced settle/shutdown contract.

Rollback replaces the complete secret set with the ordinary eight-key
Production runtime and redeploys the ordinary worker with no Shadow bootstrap
variables through a fresh one-use Production action. A successful stop event
or expired run is not by itself proof that the shared worker configuration was
restored.
