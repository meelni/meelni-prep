# Run Preview-Shadow Semantics On The Existing Production LiveKit Project

Status: accepted

## Context

LiveKit Cloud plans are per project. The paid Meelni project already contains
the Production interview and dormant demo deployments, and the owner cannot
use the previously recorded Preview project. Creating or repurposing another
paid deployment is not an accepted prerequisite for the bounded rehearsal.

## Decision

The first live Director Shadow evidence may use the existing Production
LiveKit project and interview deployment only as a transport topology. It does
not advance the adaptive rollout stage to `production_shadow`: the durable
control plane remains the isolated staging lane, the cohort remains `shadow`,
exposure remains `none`, and all influence/default/launch fields remain false.

The exact reviewed interview worker is updated in place through a new guarded
Production-project-Shadow deploy mode. Three independent authorities fence the
overall workflow:

1. the existing one-use `livekit-production-interview-deploy` Production
   action bound to the exact candidate, Production config, Production target,
   and complete runtime-secret snapshot; and
2. a fresh exact Shadow owner decision bound to the staging control plane,
   run, config, selected adapter, expiry, synthetic cohort, and exposure
   `none`; and
3. after exact deployment postflight, a one-use
   `livekit-production-shadow-room` action bound to the Production project,
   interview agent, current deployment version, run, revision, cell, session
   binding and expiry.

The deploy action changes only the worker. The Shadow decision activates only
the logical run. The room action creates at most one exact synthetic room and
dispatch. Each verifier rejects the other domains.

Only explicit private Shadow job metadata may construct the read-only Director
path. Ordinary Production metadata never does. Durable lease allocation must
commit before room creation or explicit dispatch. The first live step is one
synthetic cell, not the full matrix. Terminal evidence must reconcile before a
second cell. Rollback first overwrites the complete secret set with the
ordinary runtime (removing Shadow bootstrap variables), then restores the
ordinary all-off Production worker through the guarded wrapper; active
customer sessions retain LiveKit's normal rolling drain behavior.

## Consequences

- The paid project needs no third deployment and the demo worker is untouched.
- Updating the shared interview worker is a Production mutation even with
  exposure none, so repository merge or the Shadow signature alone is
  insufficient.
- The Production project is not used as proof that Preview isolation exists;
  evidence names the topology honestly as `production_project_shadow`.
- No direct `lk agent deploy`, secret update, room creation, or dispatch is an
  approved substitute for the guarded commands.
- Any source/config/target/expiry/revision mismatch, ordinary metadata, hard
  stop, or unconfirmed settlement produces no next room.
- SAV-476 retains Preview influence, Production rollout, default-on, and final
  launch authority.
