# Human-Owned Launch Decision

Date: 2026-07-13
Status: accepted

## Context

Meelni uses deterministic release gates, provider rehearsals, agent reviews,
and evidence records to assess relaunch readiness. Those controls can show that
a candidate is ready, not ready, or blocked, but they do not own the product
decision to launch. Prior work sometimes described an agent recommendation or
a failed technical gate as the launch GO/NO-GO decision itself.

The product owner has clarified that launch authority is not delegated to an
agent, automated gate, reviewer panel, provider, or release workflow.

## Decision

- Only the human product owner makes Meelni's final launch GO/NO-GO decision.
- Agents gather evidence, assess the accepted launch criteria, and issue a
  **launch-readiness recommendation** such as `ready`, `not ready`, or
  `blocked`. They must not present that recommendation as the owner's decision.
- Automated and provider gates remain required evidence and execution
  preconditions where the accepted release process requires them. Passing them
  does not create a launch decision; failing them does not fabricate an owner
  NO-GO decision.
- Until the owner explicitly records GO, the relaunch experience remains
  default-off. Absence of GO is a rollout state, not an inferred owner NO-GO.
- An owner GO/NO-GO must be explicit and tied to the candidate being reviewed.
  Continuing implementation, approving a rehearsal, delegating adjudication,
  or authorizing bounded spend does not imply launch GO.
- Default-on, Production, or live-mode mutations require explicit owner
  authorization. Agents may prepare the exact action and rollback plan, but
  must not infer authorization from a readiness recommendation.
- A launch decision does not silently waive security, legal, billing, or
  platform controls. Any exception to an accepted mandatory control must be
  separately explicit and documented.

## Consequences

- Release records distinguish the agent's readiness recommendation from the
  product owner's decision field.
- Before an owner decision exists, use `owner decision: pending` and report the
  current evidence-based recommendation separately.
- Calibration panels, design reviews, CI checks, and provider rehearsals may
  approve their bounded evidence domains only. None can approve launch.
- Linear issues and pull requests must not claim that an agent owns the final
  GO/NO-GO or that technical test success automatically authorizes launch.
- The feature flag remains default-off until an explicit owner GO and a
  separately authorized launch action are recorded for the exact candidate.
- Production action authorization applies only to release and maintenance
  entrypoints. It must not block ordinary authenticated or provider-signed
  customer/runtime transactions such as cancellation, deletion, webhooks,
  Checkout, or interview sessions.

## Validation

- Relaunch runbooks and PR templates should expose separate fields for
  `readiness recommendation` and `owner launch decision`.
- Repository guidance should contain no durable statement assigning final
  launch GO/NO-GO authority to an agent or automated system.
- Final launch evidence must bind the owner decision to the exact reviewed
  commit/deployment and preserve the rollback path.
