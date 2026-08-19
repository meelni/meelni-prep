# SAV-475: Gate Director Recommendations

## Why

SAV-474 can produce asynchronous, session-local advice, but the application
must never wait for it or let it bypass the deterministic interviewer. The next
slice needs a narrow influence seam that is safe to disable instantly and is
observably identical to today whenever advice is unusable.

## What Changes

- Add a synchronous, disabled-by-default influence policy at the existing
  serialized interviewer-tool admission boundary.
- Inspect only an already-ready recommendation; never start or await work.
- Require exact current authority, freshness, legal move/target, probe
  eligibility, deadline, lifecycle, one-question/no-coaching/close rules, and
  the authoritative delivered ledger.
- Let an accepted recommendation propose only move type and target, then require
  normal request assessment and controller admission.
- Emit content-free attribution, closed accept/reject/ignore reasons, and
  planned/admitted/canonically-delivered traces.
- Re-read the exact server-owned policy on every admission so the kill switch
  revokes influence immediately without a code deploy.

## What Does Not Change

The five-tool surface, controller/lifecycle/transcript/feedback authorities,
Director shadow execution, model prompt, and customer output remain unchanged.
No provider adapter, live flag, Preview/Production action, deployment, merge,
default-on, or launch is included.
