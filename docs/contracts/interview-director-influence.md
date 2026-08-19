# Interview Director Influence Gate

Status: repository implementation for SAV-475; runtime/provider influence
remains disabled

## Authority

The influence gate is a synchronous policy inside the existing session-scoped
interviewer-tool lock. It is not an agent, controller, tool host, transcript
writer, evaluator, settlement worker, or speech source.

It can inspect only an already-published `director-recommendation.v1`. It has no
async method and cannot start, await, retry, cancel, or recover Director work.
The existing five-tool call is the trigger. An accepted recommendation may
change only the requested move type, target, and that move's corresponding
closed controller-validated reason code; the existing request assessor and
SAV-471 controller must still authorize the effective request. Commit remains
non-close and graceful-close remains close-only.

## Exact policy and kill switch

Influence requires the exact server value
`MEELNI_INTERVIEW_DIRECTOR_INFLUENCE_V1_ENABLED=true`. The gate reads this
policy on every admission rather than caching it at session construction. A
ready recommendation therefore has no authority after the value is revoked.
Unknown, mixed-case, spaced, or malformed values are disabled.

Stable implementation attribution includes:

- `interview-director-influence.v1` contract;
- `interview-director-influence-policy.v1` policy;
- `interview-director-influence-config.v1` configuration;
- the exact rollout cohort; and
- the recommendation contract, Director policy, and model-adapter versions.

The flag defaults off. The application still injects no SAV-474 adapter. This
contract does not authorize provider, Preview, Production, live-room, deploy,
default-on, or launch changes.

## Eligibility

The recommendation must be finalized, unexpired, already valid, and exact for:

- session, brief, writer ID and generation;
- controller state revision and lifecycle revision/status;
- source turn ID and authoritative transcript revision;
- current question/source/topic and current interview phase;
- deadline and speech fencing;
- an allowed move and legal target;
- current probe-candidate eligibility; and
- the controller's already-delivered probe ledger.

`probe`, `clarify`, and `challenge` require an exact current candidate ID.
`transition` requires the exact next catalog topic and no candidate ID. `close`
requires the current topic, no candidate ID, and ordinary close eligibility.
The no-coaching, one-question, source, close, pending-move, lifecycle, and
deadline rules remain controller-owned.

## Fallback and replay

Disabled, unavailable, missing, malformed, repeated, stale, late, mismatched,
ineligible, already-delivered, tool-incompatible, or controller-denied advice
is ignored or rejected and the original deterministic request proceeds exactly
as it would with influence disabled. Director outcomes never request model tool
fallback.

The pre-delivery consumed-ID set has a fixed capacity and is scoped to the
current finalized source turn/transcript revision. It is cleared on source
authority advance and settlement. It is only a duplicate fence; the
controller's bounded delivered-probe ledger is authoritative after delivery.

## Closed decisions and traces

Decision reasons are a closed content-free vocabulary covering accepted,
flag-disabled, unavailable/missing/malformed/repeated, exact-authority
mismatches, not-yet-valid/expired, deadline/lifecycle/speech fences, disallowed
move/target/tool kind, probe ineligibility/already-delivered, and controller
denial.

Trace stages distinguish recommendation `planned`, controller `admitted`, and
`canonically_delivered`. Events include versions, cohort, move categories,
closed reason, bounded age, and stage. They contain no session, turn, question,
topic, probe, transcript, prompt, quote, evidence, score, provider payload,
secret, tool payload, or reasoning.

## Feedback integrity

Influence does not write transcript/evidence or scoring inputs. Post-interview
feedback continues to consume only canonical transcript evidence. Synthetic
benchmark and feedback-integrity gates must pass before any later owner review.
